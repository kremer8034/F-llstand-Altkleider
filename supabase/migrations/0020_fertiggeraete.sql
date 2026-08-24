-- ============================================================================
-- 0020_fertiggeraete.sql
--
-- Fertiggeraete melden anders als der Eigenbau. Konkret: der Milesight
-- EM400-TLD in der NB-IoT-Ausfuehrung, der ohne Loetkolben und ohne Firmware
-- auskommt (docs/sensor-entscheidung.md, Abschnitt 5; docs/em400-tld.md).
--
-- 0009_geraetevielfalt.sql hat den Messbereich je Geraet schon vorbereitet.
-- Was dort noch fehlte, sind drei Kleinigkeiten, ohne die Messwerte des
-- EM400 unterwegs verloren gingen:
--
--   a) Batteriestand in PROZENT statt in Volt
--   b) IMEI eindeutig - darueber weist sich das Geraet aus
--   c) Schwelle fuer den Batteriealarm in Prozent
--
-- Alles additiv. Der Eigenbau meldet weiterhin Volt, das Fertiggeraet Prozent,
-- und beide Wege landen in derselben Messtabelle.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Batteriestand in Prozent
--
-- Warum nicht umrechnen? Weil die Umrechnung eine Erfindung waere. Der EM400
-- kennt seinen Ladezustand aus der Entladekurve zweier Lithium-Zellen; welche
-- Spannung dahintersteht, sagt er nicht. Eine ausgedachte Spannung in eine
-- Spalte zu schreiben, die "Volt" heisst, waere ein Messwert, den nie jemand
-- gemessen hat - und der Batteriealarm haenge an einer Erfindung.
--
-- Also zwei Spalten nebeneinander. Jedes Geraet fuellt die, die es kennt.
-- ---------------------------------------------------------------------------
alter table public.messung
  add column if not exists batterie_prozent smallint;

alter table public.messung
  drop constraint if exists messung_batterie_bereich;
alter table public.messung
  add constraint messung_batterie_bereich
    check (batterie_prozent is null or batterie_prozent between 0 and 100);

alter table public.sensor
  add column if not exists batterie_prozent smallint;

alter table public.container_zustand
  add column if not exists batterie_prozent smallint;

comment on column public.messung.batterie_prozent is
  'Ladezustand in Prozent, wie ihn Fertiggeraete melden. Der Eigenbau meldet stattdessen batterie_v.';

-- ---------------------------------------------------------------------------
-- b) IMEI eindeutig
--
-- Der Eigenbau weist sich mit seiner Geraete-ID aus, die wir selbst vergeben.
-- Ein gekauftes Geraet hat diese ID nicht: es nennt in jeder Meldung seine
-- IMEI. Damit ist sie eine Kennung und keine Notiz mehr - und doppelt
-- eingetragen war sie ohnehin immer ein Fehler.
--
-- Schlaegt das Anlegen fehl, gibt es bereits Dubletten:
--   select imei, count(*) from public.sensor
--    where imei is not null group by imei having count(*) > 1;
-- ---------------------------------------------------------------------------
create unique index if not exists sensor_imei_eindeutig
  on public.sensor (imei)
  where imei is not null;

-- ---------------------------------------------------------------------------
-- c) Batteriealarm auch fuer Prozentwerte
--
-- Die vorhandene Nachbereitung kannte nur Volt. Ein EM400 mit 8 % Restladung
-- haette bis zum Stillstand gemeldet, ohne dass jemand gewarnt worden waere -
-- und danach waere es der Alarm "kein Signal" gewesen, also die Meldung, dass
-- etwas kaputt ist, statt der Meldung, dass eine Batterie zu tauschen ist.
--
-- Der Rest der Funktion ist unveraendert aus 0002_funktionen.sql uebernommen.
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung)
values (
  'batterie_min_prozent',
  '20'::jsonb,
  'Ab diesem Ladezustand in Prozent meldet ein Fertiggeraet Batterie schwach.'
)
on conflict (schluessel) do nothing;

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
  v_batterie_min_pro  numeric := public.einstellung_zahl('batterie_min_prozent', 20);
  v_leerung_diff      numeric := public.einstellung_zahl('leerung_erkennung_diff', 40);
begin
  -- Sensor-Statuszeile aktualisieren
  update public.sensor
     set letzte_meldung_am = greatest(coalesce(letzte_meldung_am, new.gemessen_am), new.gemessen_am),
         batterie_v = coalesce(new.batterie_v, batterie_v),
         batterie_prozent = coalesce(new.batterie_prozent, batterie_prozent),
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
    gemessen_am, batterie_v, batterie_prozent, rssi, geaendert_am
  )
  values (
    new.container_id, new.sensor_id, new.fuellstand_prozent, new.abstand_mm,
    new.gemessen_am, new.batterie_v, new.batterie_prozent, new.rssi, now()
  )
  on conflict (container_id) do update
    set sensor_id = excluded.sensor_id,
        fuellstand_prozent = excluded.fuellstand_prozent,
        abstand_mm = excluded.abstand_mm,
        gemessen_am = excluded.gemessen_am,
        batterie_v = excluded.batterie_v,
        batterie_prozent = excluded.batterie_prozent,
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

  -- Batteriealarm: Volt (Eigenbau) ODER Prozent (Fertiggeraet)
  if new.batterie_v is not null and new.batterie_v < v_batterie_min then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'batterie_schwach', new.batterie_v,
            format('Batteriespannung nur noch %s V.', new.batterie_v))
    on conflict do nothing;
  elsif new.batterie_prozent is not null and new.batterie_prozent < v_batterie_min_pro then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'batterie_schwach', new.batterie_prozent,
            format('Batterie nur noch %s %% - Zellen tauschen.', new.batterie_prozent))
    on conflict do nothing;
  elsif new.batterie_v is not null or new.batterie_prozent is not null then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'batterie_schwach' and geschlossen_am is null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- d) Bekannte Bauarten dokumentieren
--
-- Nach wie vor bewusst text und kein Enum (Begruendung in 0009). Die Liste
-- der geprueften Geraete steht in lib/geraetearten.ts, damit Oberflaeche und
-- Dekoder dieselbe Quelle haben.
-- ---------------------------------------------------------------------------
comment on column public.sensor.bauart is
  'Geraetebauart, frei erweiterbar: "eigenbau" (ESP32 + A02YYUW), '
  '"milesight_em400_tld" (ToF-Laser, NB-IoT), "milesight_em400_mud" (Ultraschall, NB-IoT) '
  'oder "dragino_dds75". Die Liste samt Messbereichen steht in lib/geraetearten.ts.';
