-- ============================================================================
-- 0002_funktionen.sql
-- Hilfsfunktionen, Trigger und die Logik hinter Fuellstand, Leerung und Alarm.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Kleine Helfer
-- ---------------------------------------------------------------------------
create or replace function public.einstellung_zahl(p_schluessel text, p_standard numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (wert #>> '{}')::numeric from public.einstellung where schluessel = p_schluessel), p_standard);
$$;

create or replace function public.fuellstand_stufe(p_prozent smallint)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_prozent is null then 'unbekannt'
    when p_prozent >= 90 then 'voll'
    when p_prozent >= 75 then 'hoch'
    when p_prozent >= 50 then 'teilweise'
    else 'frei'
  end;
$$;

-- Abstand -> Fuellstand. Kleiner Abstand bedeutet viel Inhalt.
create or replace function public.berechne_fuellstand(
  p_leer_abstand_mm integer,
  p_voll_abstand_mm integer,
  p_abstand_mm      integer
)
returns smallint
language plpgsql
immutable
set search_path = public
as $$
declare
  v_spanne integer;
  v_wert   numeric;
begin
  if p_abstand_mm is null or p_leer_abstand_mm is null then
    return null;
  end if;

  v_spanne := p_leer_abstand_mm - coalesce(p_voll_abstand_mm, round(p_leer_abstand_mm * 0.15));
  if v_spanne <= 0 then
    return null;
  end if;

  v_wert := (p_leer_abstand_mm - p_abstand_mm)::numeric / v_spanne * 100;
  return greatest(0, least(100, round(v_wert)))::smallint;
end;
$$;

comment on function public.berechne_fuellstand is
  'Rechnet den Ultraschall-Abstand anhand der Container-Kalibrierung in Prozent um (0-100).';

-- geaendert_am automatisch pflegen
create or replace function public.setze_geaendert_am()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;

create trigger container_geaendert before update on public.container
  for each row execute function public.setze_geaendert_am();
create trigger sensor_geaendert before update on public.sensor
  for each row execute function public.setze_geaendert_am();
create trigger benutzerprofil_geaendert before update on public.benutzerprofil
  for each row execute function public.setze_geaendert_am();

-- ---------------------------------------------------------------------------
-- Rollen (security definer, damit die RLS-Policies sich nicht selbst blockieren)
-- ---------------------------------------------------------------------------
create or replace function public.aktuelle_rolle()
returns public.benutzerrolle
language sql
stable
security definer
set search_path = public
as $$
  select rolle from public.benutzerprofil where id = auth.uid() and aktiv;
$$;

create or replace function public.ist_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.aktuelle_rolle() = 'admin', false);
$$;

create or replace function public.ist_mindestens_dispo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.aktuelle_rolle() in ('admin', 'dispo'), false);
$$;

create or replace function public.ist_angemeldet()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.benutzerprofil where id = auth.uid() and aktiv);
$$;

-- ---------------------------------------------------------------------------
-- Profil beim Registrieren automatisch anlegen
-- ---------------------------------------------------------------------------
create or replace function public.neuen_benutzer_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rolle public.benutzerrolle;
  v_erster boolean;
begin
  -- Der allererste Benutzer wird Administrator, alle weiteren Fahrpersonal.
  select not exists (select 1 from public.benutzerprofil) into v_erster;

  begin
    v_rolle := coalesce((new.raw_user_meta_data ->> 'rolle')::public.benutzerrolle, 'fahrer');
  exception when others then
    v_rolle := 'fahrer';
  end;

  if v_erster then
    v_rolle := 'admin';
  end if;

  insert into public.benutzerprofil (id, name, email, rolle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    v_rolle
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger auth_benutzer_angelegt
  after insert on auth.users
  for each row execute function public.neuen_benutzer_anlegen();

-- ---------------------------------------------------------------------------
-- Messung: vor dem Einfuegen Container und Fuellstand ergaenzen
-- ---------------------------------------------------------------------------
create or replace function public.messung_vorbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container public.container%rowtype;
  v_offset integer;
begin
  if new.container_id is null then
    select container_id into new.container_id from public.sensor where id = new.sensor_id;
  end if;

  if new.container_id is null then
    return new; -- Sensor noch nicht angelernt: Messung wird nur protokolliert
  end if;

  select * into v_container from public.container where id = new.container_id;
  select montage_offset_mm into v_offset from public.sensor where id = new.sensor_id;

  if new.fuellstand_prozent is null then
    new.fuellstand_prozent := public.berechne_fuellstand(
      v_container.leer_abstand_mm,
      v_container.voll_abstand_mm,
      new.abstand_mm + coalesce(v_offset, 0)
    );
  end if;

  -- Offensichtlich unbrauchbare Messwerte markieren statt verwerfen
  if new.abstand_mm is null or new.abstand_mm <= 0 or new.abstand_mm > 6000 then
    new.gueltig := false;
    new.fuellstand_prozent := null;
  end if;

  return new;
end;
$$;

create trigger messung_vorbereiten_trg
  before insert on public.messung
  for each row execute function public.messung_vorbereiten();

-- ---------------------------------------------------------------------------
-- Messung: nach dem Einfuegen Zustand, Leerung und Alarme pflegen
-- ---------------------------------------------------------------------------
create or replace function public.messung_nachbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vorher            smallint;
  v_schwelle_voll     numeric := public.einstellung_zahl('schwelle_voll', 90);
  v_schwelle_warnung  numeric := public.einstellung_zahl('schwelle_warnung', 75);
  v_batterie_min      numeric := public.einstellung_zahl('batterie_min_v', 3.4);
  v_leerung_diff      numeric := public.einstellung_zahl('leerung_erkennung_diff', 40);
begin
  -- Sensor-Statuszeile aktualisieren
  update public.sensor
     set letzte_meldung_am = greatest(coalesce(letzte_meldung_am, new.gemessen_am), new.gemessen_am),
         batterie_v = coalesce(new.batterie_v, batterie_v),
         rssi = coalesce(new.rssi, rssi)
   where id = new.sensor_id;

  -- "Kein Signal" ist mit dieser Meldung erledigt
  update public.alarm
     set geschlossen_am = now()
   where sensor_id = new.sensor_id and typ = 'kein_signal' and geschlossen_am is null;

  if new.container_id is null or not new.gueltig then
    return new;
  end if;

  -- Vorherigen Fuellstand merken (fuer die Leerungserkennung)
  select fuellstand_prozent into v_vorher
    from public.container_zustand
   where container_id = new.container_id;

  -- Zustand nur fortschreiben, wenn die Messung neuer ist als die gespeicherte
  insert into public.container_zustand as z (
    container_id, sensor_id, fuellstand_prozent, abstand_mm,
    gemessen_am, batterie_v, rssi, geaendert_am
  )
  values (
    new.container_id, new.sensor_id, new.fuellstand_prozent, new.abstand_mm,
    new.gemessen_am, new.batterie_v, new.rssi, now()
  )
  on conflict (container_id) do update
    set sensor_id = excluded.sensor_id,
        fuellstand_prozent = excluded.fuellstand_prozent,
        abstand_mm = excluded.abstand_mm,
        gemessen_am = excluded.gemessen_am,
        batterie_v = excluded.batterie_v,
        rssi = excluded.rssi,
        geaendert_am = now()
  where z.gemessen_am is null or excluded.gemessen_am >= z.gemessen_am;

  -- Leerung erkennen: deutlicher Sprung nach unten auf niedrigen Fuellstand
  if v_vorher is not null
     and new.fuellstand_prozent is not null
     and (v_vorher - new.fuellstand_prozent) >= v_leerung_diff
     and new.fuellstand_prozent < 30
  then
    insert into public.leerung (container_id, geleert_am, fuellstand_vorher, fuellstand_nachher, art)
    values (new.container_id, new.gemessen_am, v_vorher, new.fuellstand_prozent, 'automatisch');
  end if;

  -- Fuellstandsalarm oeffnen bzw. schliessen
  if new.fuellstand_prozent >= v_schwelle_voll then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'fuellstand', new.fuellstand_prozent,
            format('Container ist zu %s %% gefuellt.', new.fuellstand_prozent))
    on conflict do nothing;
  elsif new.fuellstand_prozent < v_schwelle_warnung then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'fuellstand' and geschlossen_am is null;
  end if;

  -- Batteriealarm
  if new.batterie_v is not null and new.batterie_v < v_batterie_min then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'batterie_schwach', new.batterie_v,
            format('Batteriespannung nur noch %s V.', new.batterie_v))
    on conflict do nothing;
  elsif new.batterie_v is not null then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'batterie_schwach' and geschlossen_am is null;
  end if;

  return new;
end;
$$;

create trigger messung_nachbereiten_trg
  after insert on public.messung
  for each row execute function public.messung_nachbereiten();

-- ---------------------------------------------------------------------------
-- Leerung von Hand erfasst -> Zustand auf 0 zuruecksetzen
-- ---------------------------------------------------------------------------
create or replace function public.leerung_nachbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.art = 'manuell' then
    update public.container_zustand
       set fuellstand_prozent = coalesce(new.fuellstand_nachher, 0),
           geaendert_am = now()
     where container_id = new.container_id;
  end if;

  update public.alarm
     set geschlossen_am = now()
   where container_id = new.container_id and typ = 'fuellstand' and geschlossen_am is null;

  return new;
end;
$$;

create trigger leerung_nachbereiten_trg
  after insert on public.leerung
  for each row execute function public.leerung_nachbereiten();

-- ---------------------------------------------------------------------------
-- Anlernen / "Verheiraten" von Sensor und Container
-- ---------------------------------------------------------------------------
create or replace function public.sensor_koppeln(
  p_anlerncode text,
  p_container_id uuid,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_ersetzen boolean default false,
  p_notiz text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code      public.anlerncode%rowtype;
  v_sensor    public.sensor%rowtype;
  v_container public.container%rowtype;
  v_alter_sensor uuid;
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select * into v_code
    from public.anlerncode
   where upper(replace(code, '-', '')) = upper(replace(p_anlerncode, '-', ''));

  if not found then
    raise exception 'Anlerncode unbekannt.' using errcode = 'P0002';
  end if;
  if v_code.gueltig_bis < now() then
    raise exception 'Anlerncode ist abgelaufen.' using errcode = 'P0002';
  end if;

  select * into v_sensor from public.sensor where id = v_code.sensor_id;
  select * into v_container from public.container where id = p_container_id;

  if not found then
    raise exception 'Container nicht gefunden.' using errcode = 'P0002';
  end if;

  -- Sensor haengt schon an einem anderen Container?
  if v_sensor.container_id is not null and v_sensor.container_id <> p_container_id then
    if not p_ersetzen then
      raise exception 'Sensor % ist bereits mit Container % gekoppelt.',
        v_sensor.geraete_id,
        (select nummer from public.container where id = v_sensor.container_id)
        using errcode = 'P0001';
    end if;
    update public.sensor_kopplung set getrennt_am = now()
     where sensor_id = v_sensor.id and getrennt_am is null;
    update public.container_zustand set sensor_id = null where sensor_id = v_sensor.id;
  end if;

  -- Container hat schon einen anderen Sensor?
  select id into v_alter_sensor
    from public.sensor
   where container_id = p_container_id and id <> v_sensor.id;

  if v_alter_sensor is not null then
    if not p_ersetzen then
      raise exception 'Container % hat bereits einen Sensor.', v_container.nummer
        using errcode = 'P0001';
    end if;
    update public.sensor
       set container_id = null, status = 'ausser_betrieb'
     where id = v_alter_sensor;
    update public.sensor_kopplung set getrennt_am = now()
     where sensor_id = v_alter_sensor and getrennt_am is null;
  end if;

  update public.sensor
     set container_id = p_container_id,
         status = 'angelernt',
         angelernt_am = now(),
         angelernt_von = auth.uid()
   where id = v_sensor.id;

  insert into public.sensor_kopplung (sensor_id, container_id, angelernt_von, gps_lat, gps_lng, notiz)
  values (v_sensor.id, p_container_id, auth.uid(), p_gps_lat, p_gps_lng, p_notiz)
  on conflict do nothing;

  update public.anlerncode
     set verbraucht_am = now(), verbraucht_von = auth.uid()
   where id = v_code.id;

  -- Bereits eingegangene Messungen dieses Sensors dem Container zuordnen
  update public.messung
     set container_id = p_container_id
   where sensor_id = v_sensor.id
     and container_id is null
     and gemessen_am > now() - interval '2 hours';

  return jsonb_build_object(
    'sensor_id', v_sensor.id,
    'geraete_id', v_sensor.geraete_id,
    'container_id', p_container_id,
    'container_nummer', v_container.nummer,
    'kalibriert', v_container.leer_abstand_mm is not null
  );
end;
$$;

comment on function public.sensor_koppeln is
  'Verheiratet einen Sensor per Anlerncode mit einem Container und schreibt die Kopplungshistorie fort.';

-- Kalibrierung: Leerwert aus den letzten Messungen uebernehmen
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
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select id into v_sensor_id from public.sensor where container_id = p_container_id;

  -- Kein Wert vorgegeben: Median der letzten 5 Messungen der letzten Stunde nehmen
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
           and gemessen_am > now() - interval '1 hour'
         order by gemessen_am desc
         limit 5
      ) letzte;

    if v_leer is null then
      raise exception 'Noch keine Messung in der letzten Stunde. Bitte Taster am Sensor druecken.'
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

  -- Vorhandene Messungen mit der neuen Kalibrierung nachrechnen
  update public.messung m
     set fuellstand_prozent = public.berechne_fuellstand(v_leer, v_voll, m.abstand_mm)
   where m.container_id = p_container_id and m.gueltig;

  update public.container_zustand z
     set fuellstand_prozent = public.berechne_fuellstand(v_leer, v_voll, z.abstand_mm),
         geaendert_am = now()
   where z.container_id = p_container_id;

  update public.sensor_kopplung
     set kalibrierung = jsonb_build_object('leer_abstand_mm', v_leer, 'voll_abstand_mm', v_voll, 'am', now())
   where container_id = p_container_id and getrennt_am is null;

  return jsonb_build_object('leer_abstand_mm', v_leer, 'voll_abstand_mm', v_voll);
end;
$$;

-- Kopplung wieder loesen
create or replace function public.sensor_entkoppeln(p_sensor_id uuid, p_notiz text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ist_mindestens_dispo() then
    raise exception 'Nur Disposition oder Administration duerfen entkoppeln.' using errcode = '42501';
  end if;

  update public.sensor_kopplung
     set getrennt_am = now(), notiz = coalesce(p_notiz, notiz)
   where sensor_id = p_sensor_id and getrennt_am is null;

  update public.container_zustand set sensor_id = null where sensor_id = p_sensor_id;

  update public.sensor
     set container_id = null, status = 'ausser_betrieb'
   where id = p_sensor_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ueberwachung: Sensoren, die zu lange nichts gemeldet haben
-- ---------------------------------------------------------------------------
create or replace function public.pruefe_stille_sensoren()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stunden numeric := public.einstellung_zahl('max_stille_stunden', 30);
  v_anzahl  integer := 0;
begin
  with kandidaten as (
    select s.id as sensor_id, s.container_id, s.geraete_id, s.letzte_meldung_am
      from public.sensor s
     where s.status = 'angelernt'
       and s.container_id is not null
       and (s.letzte_meldung_am is null or s.letzte_meldung_am < now() - make_interval(hours => v_stunden::integer))
  )
  insert into public.alarm (container_id, sensor_id, typ, text)
  select k.container_id, k.sensor_id, 'kein_signal',
         case
           when k.letzte_meldung_am is null then 'Sensor hat noch nie gemeldet.'
           else format('Keine Meldung seit %s.', to_char(k.letzte_meldung_am, 'DD.MM.YYYY HH24:MI'))
         end
    from kandidaten k
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tourenliste: was als naechstes angefahren werden sollte
--
-- Bewusst SECURITY INVOKER: die Funktion liest ausschliesslich Tabellen, die
-- schon eigene Zugriffsregeln haben. Damit greifen diese Regeln von selbst -
-- ohne Anmeldung kommt schlicht nichts zurueck. Als SECURITY DEFINER waere sie
-- ein zweiter, leicht zu uebersehender Weg an den Regeln vorbei.
-- ---------------------------------------------------------------------------
create or replace function public.tourenliste(p_schwelle smallint default null)
returns table (
  container_id       uuid,
  nummer             text,
  bezeichnung        text,
  strasse            text,
  plz                text,
  ort                text,
  lat                double precision,
  lng                double precision,
  fuellstand_prozent smallint,
  gemessen_am        timestamptz,
  stunden_seit_messung numeric,
  offene_meldungen   bigint,
  prioritaet         numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with schwelle as (
    select coalesce(p_schwelle, public.einstellung_zahl('schwelle_warnung', 75))::numeric as wert
  )
  select
    c.id,
    c.nummer,
    c.bezeichnung,
    c.strasse,
    c.plz,
    c.ort,
    c.lat,
    c.lng,
    z.fuellstand_prozent,
    z.gemessen_am,
    round(extract(epoch from (now() - z.gemessen_am)) / 3600.0, 1) as stunden_seit_messung,
    (select count(*) from public.meldung m
      where m.container_id = c.id and m.erledigt_am is null) as offene_meldungen,
    -- Prioritaet: Fuellstand plus Zuschlag fuer offene Meldungen und Standzeit
    coalesce(z.fuellstand_prozent, 0)
      + (select count(*) * 10 from public.meldung m
          where m.container_id = c.id and m.erledigt_am is null)
      + least(10, extract(epoch from (now() - coalesce(z.gemessen_am, now()))) / 86400.0) as prioritaet
  from public.container c
  left join public.container_zustand z on z.container_id = c.id
  cross join schwelle s
  where c.status = 'aktiv'
    and (
      z.fuellstand_prozent >= s.wert
      or exists (select 1 from public.meldung m where m.container_id = c.id and m.erledigt_am is null)
    )
  order by prioritaet desc;
$$;
