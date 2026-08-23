-- ============================================================================
-- 0009_geraetevielfalt.sql
--
-- Bereitet die Datenbank darauf vor, dass nicht nur der Eigenbau Messwerte
-- liefert, sondern moeglicherweise ein gekauftes Geraet (siehe
-- docs/sensor-entscheidung.md). Alles additiv und mit Vorgabewerten -
-- vorhandene Zeilen bleiben unveraendert gueltig.
--
-- Drei Dinge:
--   a) Bauart und Messbereich je Sensor
--   b) ICCID eindeutig - ein gekauftes Geraet weist sich ueber seine SIM aus
--   c) Kalibrierfenster einstellbar statt fest auf eine Stunde
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Bauart und Messbereich
-- ---------------------------------------------------------------------------
alter table public.sensor
  add column if not exists bauart      text    not null default 'eigenbau',
  add column if not exists mess_min_mm integer not null default 30,
  add column if not exists mess_max_mm integer not null default 6000;

alter table public.sensor
  add constraint sensor_bauart_gesetzt check (bauart <> '');

-- Bewusst text und kein Enum: ein Enum-Wert laesst sich nur ausserhalb einer
-- Transaktion ergaenzen und nie wieder entfernen. Die Liste der Bauarten
-- waechst aber mit jedem geprueften Geraet - dafuer ist Enum der falsche Typ.
comment on column public.sensor.bauart is
  'Geraetebauart, frei erweiterbar: "eigenbau" (ESP32 + A02YYUW) oder die '
  'Kennung eines gekauften Geraets, z. B. "dragino_dds75".';

comment on column public.sensor.mess_min_mm is
  'Untere Messgrenze dieses Geraets in mm (Blindzone). Darunter gilt die '
  'Messung als ungueltig.';
comment on column public.sensor.mess_max_mm is
  'Obere Messgrenze dieses Geraets in mm. Dragino DDS75 = 7500, '
  'Milesight EM400-MUD = 4500, Eigenbau A02YYUW = 4500.';

-- ---------------------------------------------------------------------------
-- b) ICCID eindeutig
--
-- Bisher war die ICCID ein freies Feld. Weist sich ein Geraet ueber seine SIM
-- aus, muss sie eindeutig sein - und doppelt eingetragen ist sie ohnehin immer
-- ein Fehler. Schlaegt das Anlegen des Index fehl, gibt es bereits Dubletten;
-- die sind vor dem Einspielen zu bereinigen:
--   select iccid, count(*) from public.sensor
--    where iccid is not null group by iccid having count(*) > 1;
-- ---------------------------------------------------------------------------
create unique index if not exists sensor_iccid_eindeutig
  on public.sensor (iccid)
  where iccid is not null;

-- ---------------------------------------------------------------------------
-- c) Messung vorbereiten: Messbereich je Sensor, Pruefung nach vorn
--
-- Zwei Aenderungen gegenueber 0002:
--
--   1. Die Plausibilitaetspruefung steht jetzt VOR der Rueckgabe fuer noch
--      nicht angelernte Geraete. Bisher wurde sie dort uebersprungen - dabei
--      ordnet sensor_koppeln genau diese Messungen beim Anlernen nachtraeglich
--      einem Container zu, und container_kalibrieren zieht sie anschliessend
--      fuer den Leerwert heran. Ein Ausreisser aus der Werkstatt konnte so die
--      Kalibrierung verderben.
--
--   2. Statt der festen Obergrenze von 6000 mm gelten die Grenzen des
--      jeweiligen Geraets. Die untere Grenze ist damit die Blindzone und nicht
--      mehr nur "groesser als null".
-- ---------------------------------------------------------------------------
create or replace function public.messung_vorbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sensor    public.sensor%rowtype;
  v_container public.container%rowtype;
begin
  select * into v_sensor from public.sensor where id = new.sensor_id;

  -- Offensichtlich unbrauchbare Messwerte markieren statt verwerfen
  if new.abstand_mm is null
     or new.abstand_mm < coalesce(v_sensor.mess_min_mm, 30)
     or new.abstand_mm > coalesce(v_sensor.mess_max_mm, 6000)
  then
    new.gueltig := false;
    new.fuellstand_prozent := null;
  end if;

  if new.container_id is null then
    new.container_id := v_sensor.container_id;
  end if;

  if new.container_id is null then
    return new; -- Sensor noch nicht angelernt: Messung wird nur protokolliert
  end if;

  if not new.gueltig then
    return new; -- kein Fuellstand aus einem Wert, dem nicht zu trauen ist
  end if;

  select * into v_container from public.container where id = new.container_id;

  if new.fuellstand_prozent is null then
    new.fuellstand_prozent := public.berechne_fuellstand(
      v_container.leer_abstand_mm,
      v_container.voll_abstand_mm,
      new.abstand_mm + coalesce(v_sensor.montage_offset_mm, 0)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- d) Kalibrierfenster einstellbar
--
-- Bisher fest: der Leerwert wurde aus den Messungen der letzten Stunde
-- gemittelt, sonst kam "Bitte Taster am Sensor druecken". Ein Geraet ohne
-- Taster, das alle sechs Stunden meldet, laesst sich so nicht kalibrieren -
-- und der Eigenbau auch nicht, sobald der Reed-Kontakt klemmt.
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung)
values (
  'kalibrier_fenster_stunden',
  '6',
  'Zeitfenster in Stunden, aus dem beim Kalibrieren der Leerwert gemittelt wird.'
)
on conflict (schluessel) do nothing;

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
  v_leer      integer := p_leer_abstand_mm;
  v_voll      integer := p_voll_abstand_mm;
  v_anteil    numeric := public.einstellung_zahl('voll_abstand_anteil', 0.15);
  v_fenster   integer := public.einstellung_zahl('kalibrier_fenster_stunden', 6)::integer;
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select id into v_sensor_id from public.sensor where container_id = p_container_id;

  -- Kein Wert vorgegeben: Median der letzten 5 Messungen im Zeitfenster nehmen
  if v_leer is null then
    if v_sensor_id is null then
      raise exception 'Container hat keinen angelernten Sensor.' using errcode = 'P0002';
    end if;

    select round(percentile_cont(0.5) within group (order by abstand_mm))::integer
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
        'Im Fenster von % Stunden liegt keine gueltige Messung vor. Entweder eine Sofortmessung ausloesen (Taster bzw. Magnet am Geraet) oder den Leerwert von Hand in Millimetern eintragen.',
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
  --
  -- Der Montageversatz muss dabei mitgerechnet werden, so wie beim Einfuegen
  -- in messung_vorbereiten: in messung.abstand_mm steht der rohe Messwert,
  -- bezogen auf die Sensorunterkante. Bis 0008 fehlte er hier - eine
  -- Nachkalibrierung verschob damit saemtliche historischen Werte um genau
  -- diesen Versatz, entgegen dem, was docs/anlernprozess.md zusichert.
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
