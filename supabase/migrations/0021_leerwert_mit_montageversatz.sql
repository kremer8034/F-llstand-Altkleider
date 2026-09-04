-- ---------------------------------------------------------------------------
-- Der automatisch ermittelte Leerwert lag um den Montageversatz daneben.
--
-- Zwei Wege führen zum Leerwert, und sie meinten Verschiedenes:
--
--   von Hand      die Innenhöhe - Deckelinnenseite bis Boden
--                 (so steht es als Beispiel im Formular)
--   automatisch   der Median der rohen Messwerte - Sensorunterkante bis Boden
--
-- Gerechnet wird der Füllstand aber immer aus `abstand_mm + montage_offset_mm`,
-- also auf die Deckelinnenseite bezogen (messung_vorbereiten, 0009). Der
-- automatische Weg lieferte damit einen Leerwert, der um genau den
-- Montageversatz zu klein war: ein leerer Container zeigte nicht 0 %, sondern
-- einen negativen Wert, der auf 0 gekappt wurde - und jeder Füllstand darüber
-- war zu niedrig.
--
-- Zu sehen war das nur bei Geräten mit Versatz. Bei montage_offset_mm = 0 -
-- der Vorgabe - stimmten beide Wege überein, weshalb es lange nicht auffiel.
--
-- Hier wird der Versatz auch im automatischen Weg addiert. Damit bedeutet
-- leer_abstand_mm an einer Stelle dasselbe wie an jeder anderen:
-- Deckelinnenseite bis Boden.
--
-- Nebenbei: die Fehlermeldung nannte "Taster bzw. Magnet am Geraet" als
-- einzigen Ausweg. Ein Fertiggerät wie der Milesight EM400 hat außen weder
-- das eine noch das andere.
-- ---------------------------------------------------------------------------

create or replace function public.container_kalibrieren(
  p_container_id uuid,
  p_leer_abstand_mm integer default null,
  p_voll_abstand_mm integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sensor_id uuid;
  v_versatz   integer := 0;
  v_leer      integer := p_leer_abstand_mm;
  v_voll      integer := p_voll_abstand_mm;
  v_anteil    numeric := public.einstellung_zahl('voll_abstand_anteil', 0.15);
  v_fenster   integer := public.einstellung_zahl('kalibrier_fenster_stunden', 6)::integer;
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select id, coalesce(montage_offset_mm, 0)
    into v_sensor_id, v_versatz
    from public.sensor
   where container_id = p_container_id;

  -- Kein Wert vorgegeben: Median der letzten 5 Messungen im Zeitfenster nehmen
  if v_leer is null then
    if v_sensor_id is null then
      raise exception 'Container hat keinen angelernten Sensor.' using errcode = 'P0002';
    end if;

    -- Der Montageversatz gehoert dazu: in messung.abstand_mm steht der rohe
    -- Wert ab Sensorunterkante, gerechnet wird aber ab Deckelinnenseite.
    select round(percentile_cont(0.5) within group (order by abstand_mm))::integer + v_versatz
      into v_leer
      from (
        select abstand_mm
          from public.messung
         where sensor_id = v_sensor_id
           and gueltig
           and abstand_mm is not null
           and gemessen_am > now() - make_interval(hours => v_fenster)
         order by gemessen_am desc
         limit 5
      ) letzte;

    if v_leer is null then
      raise exception
        'Im Fenster von % Stunden liegt keine gueltige Messung vor. Entweder eine Messung des Geraets abwarten oder den Leerwert von Hand in Millimetern eintragen (Deckelinnenseite bis Boden).',
        v_fenster
        using errcode = 'P0002';
    end if;
  end if;

  if v_voll is null then
    v_voll := greatest(50, round(v_leer * v_anteil)::integer);
  end if;

  update public.container
     set leer_abstand_mm = v_leer,
         voll_abstand_mm = v_voll
   where id = p_container_id;

  -- Vorhandene Messungen mit der neuen Kalibrierung nachrechnen.
  update public.messung m
     set fuellstand_prozent = public.berechne_fuellstand(
           v_leer, v_voll, m.abstand_mm + coalesce(s.montage_offset_mm, 0))
    from public.sensor s
   where m.container_id = p_container_id and m.gueltig and s.id = m.sensor_id;

  update public.container_zustand z
     set fuellstand_prozent = public.berechne_fuellstand(
           v_leer, v_voll,
           z.abstand_mm + coalesce(
             (select montage_offset_mm from public.sensor s where s.id = z.sensor_id), 0)),
         geaendert_am = now()
   where z.container_id = p_container_id;

  update public.sensor_kopplung
     set kalibrierung = jsonb_build_object('leer_abstand_mm', v_leer, 'voll_abstand_mm', v_voll, 'am', now())
   where container_id = p_container_id and getrennt_am is null;

  return jsonb_build_object('leer_abstand_mm', v_leer, 'voll_abstand_mm', v_voll);
end;
$$;

comment on function public.container_kalibrieren is
  'Setzt Leer- und Vollwert eines Containers. Beide beziehen sich auf die Deckelinnenseite - der Montageversatz des Sensors ist eingerechnet.';
