-- ============================================================================
-- 0026_meldungen.sql
--
-- Was die Anlage von sich aus melden soll - und was sie fuer sich behaelt.
--
-- Bisher gab es drei Meldungen: "voll", "kein Signal" und "Batterie schwach".
-- Der vierte Typ, "messfehler", stand seit 0001 im Enum und wurde nie
-- ausgeloest - eine Meldung, die es nur auf dem Papier gab. Es fehlten damit
-- genau die beiden Faelle, in denen ein Geraet nicht schweigt, aber trotzdem
-- nichts taugt:
--
--   1. Es meldet sich, doch kein einziger Wert ist zu gebrauchen. Aus Sicht
--      der Anlage ist das kein Fehler: jede einzelne Meldung wird ordentlich
--      angenommen und ordentlich als "ungueltig" abgelegt. Am 07.09.2026 hat
--      genau das acht Stunden lang stillgestanden, ohne dass irgendwo etwas
--      rot geworden waere (siehe 0025 und lib/dekoder/milesight.ts).
--   2. Der Sensor haengt schief - die Verschraubung im Deckel hat sich
--      geloest, das Geraet ist heruntergefallen. Der EM400 meldet das selbst
--      (Kanal 05: "normal"/"tilt"), und diese Angabe landete bisher nur
--      unbesehen in messung.roh.
--
-- Die Leitlinie fuer alle Schwellen hier: eine einzelne ausgefallene
-- Uebertragung ist Normalbetrieb und keine Meldung wert. Funk ist Funk. Erst
-- wenn ueber einen ganzen Tag NICHTS Brauchbares ankommt, ist etwas kaputt -
-- und dann soll es auffallen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Ein eigener Typ fuer die Schraeglage
--
-- Warum nicht "messfehler" mitbenutzen: die beiden Meldungen fuehren zu
-- verschiedenen Handgriffen. Beim Messfehler fahert jemand hin und sieht sich
-- das Geraet an; bei der Schraeglage weiss er schon vorher, was ihn erwartet,
-- und nimmt den Schraubenschluessel mit.
--
-- "add value" laeuft im selben Transaktionsblock wie der Rest dieser Datei
-- (der Einspieler nimmt psql -1). Das ist ab PostgreSQL 12 erlaubt, solange
-- der neue Wert nicht in derselben Transaktion BENUTZT wird. Die Funktionen
-- weiter unten nennen ihn nur im Rumpf - der wird erst zur Laufzeit
-- aufgeloest, also lange nach dem Commit.
-- ---------------------------------------------------------------------------
alter type public.alarmtyp add value if not exists 'sensor_lage';

-- ---------------------------------------------------------------------------
-- b) Die Lage mitschreiben
--
-- Der Dekoder liest sie seit 0020 ("normal"/"tilt"), aber sie hatte keine
-- Spalte und stand nur im Rohtext der Meldung. Eine Meldung, ueber die man
-- nicht abfragen kann, ist keine.
-- ---------------------------------------------------------------------------
alter table public.messung          add column if not exists lage text;
alter table public.container_zustand add column if not exists lage text;

comment on column public.messung.lage is
  'Lage des Geraets, wie es sie selbst meldet: "normal" oder "tilt" (schief). '
  'NULL heisst: diese Bauart sagt dazu nichts.';
comment on column public.container_zustand.lage is
  'Lage aus der letzten gueltigen Meldung - siehe messung.lage.';

-- ---------------------------------------------------------------------------
-- c) Schwellen
--
-- Alle vier sind Einstellungen und keine festen Zahlen im Code: was hier
-- richtig ist, haengt am Sendeintervall der Geraete, und das aendert sich
-- (06.09.2026: von 360 auf 1 Minute, zum Messen des Batterieverlaufs).
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung)
values
  ('messfehler_stunden', '24'::jsonb,
   'So lange darf ein Geraet melden, ohne dass ein brauchbarer Messwert dabei ist. Danach: Messfehler.'),
  ('messfehler_min_meldungen', '3'::jsonb,
   'Erst ab so vielen Meldungen im Fenster wird der Messfehler ausgeloest - eine einzelne verstuemmelte Meldung ist Normalbetrieb.'),
  ('lage_meldungen_bis_alarm', '2'::jsonb,
   'So viele Meldungen hintereinander muessen "schief" sagen, bevor die Anlage einen Sensor als verrutscht meldet.')
on conflict (schluessel) do nothing;

-- Die alten 30 Stunden stammen aus der Zeit, als ein Geraet viermal am Tag
-- meldete: 30 Stunden waren fuenf verpasste Meldungen. Gefragt ist "seit einem
-- Tag nichts mehr", also 24. Ein von Hand abweichend gesetzter Wert bleibt
-- stehen - wer ihn verstellt hat, hatte einen Grund.
update public.einstellung
   set wert = '24'::jsonb,
       beschreibung = 'Ohne jede Meldung in diesem Zeitraum wird "kein Signal" ausgeloest. Untergrenze ist immer das doppelte Sendeintervall des Geraets.'
 where schluessel = 'max_stille_stunden'
   and wert = '30'::jsonb;

-- ---------------------------------------------------------------------------
-- d) Nachbereitung einer Messung
--
-- Uebernommen aus 0020_fertiggeraete.sql. Neu sind zwei Abschnitte, beide
-- VOR der Gueltigkeitspruefung - denn eine Meldung ohne brauchbaren Abstand
-- ist genau der Fall, um den es hier geht:
--
--   * "messfehler" schliessen, sobald wieder ein brauchbarer Wert kommt
--   * "sensor_lage" oeffnen bzw. schliessen
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
  v_batterie_min_pro  numeric := public.einstellung_zahl('batterie_min_prozent', 20);
  v_leerung_diff      numeric := public.einstellung_zahl('leerung_erkennung_diff', 40);
  v_lage_grenze       integer := greatest(1, public.einstellung_zahl('lage_meldungen_bis_alarm', 2)::integer);
  v_lage_gesamt       integer;
  v_lage_schief       integer;
begin
  -- Sensor-Statuszeile aktualisieren
  update public.sensor
     set letzte_meldung_am = greatest(coalesce(letzte_meldung_am, new.gemessen_am), new.gemessen_am),
         batterie_v = coalesce(new.batterie_v, batterie_v),
         batterie_prozent = coalesce(new.batterie_prozent, batterie_prozent),
         rssi = coalesce(new.rssi, rssi)
   where id = new.sensor_id;

  -- "Kein Signal" ist mit dieser Meldung erledigt. Das gilt ausdruecklich
  -- auch fuer eine unbrauchbare Meldung: das Geraet ist erreichbar, und ob
  -- seine Werte taugen, ist die Frage des Messfehlers weiter unten.
  update public.alarm
     set geschlossen_am = now()
   where sensor_id = new.sensor_id and typ = 'kein_signal' and geschlossen_am is null;

  if new.container_id is null then
    return new;
  end if;

  -- --- Schraeglage ---------------------------------------------------------
  --
  -- Ein einzelnes "schief" loest nichts aus. Beim Leeren kippt der Deckel,
  -- beim Nachfuellen ruettelt es, und der EM400 meldet solche Augenblicke
  -- sofort. Erst wenn die letzten Meldungen ALLE schief sagen, hat sich
  -- wirklich etwas geloest.
  if new.lage is not null then
    if new.lage = 'normal' then
      update public.alarm
         set geschlossen_am = now()
       where container_id = new.container_id and typ = 'sensor_lage' and geschlossen_am is null;
    else
      select count(*), count(*) filter (where l.lage <> 'normal')
        into v_lage_gesamt, v_lage_schief
        from (
          select m.lage
            from public.messung m
           where m.sensor_id = new.sensor_id and m.lage is not null
           order by m.gemessen_am desc, m.id desc
           limit v_lage_grenze
        ) l;

      if v_lage_gesamt >= v_lage_grenze and v_lage_schief = v_lage_gesamt then
        insert into public.alarm (container_id, sensor_id, typ, text)
        values (new.container_id, new.sensor_id, 'sensor_lage',
                format('Sensor meldet seit %s Meldungen Schraeglage - Verschraubung pruefen.', v_lage_grenze))
        on conflict do nothing;
      end if;
    end if;
  end if;

  -- --- Messfehler ----------------------------------------------------------
  --
  -- Geschlossen wird hier, geoeffnet in pruefe_messfehler(). Das ist Absicht:
  -- "es geht wieder" weiss man mit einer einzigen brauchbaren Messung, "es
  -- geht seit einem Tag nicht" erst mit dem Blick auf den ganzen Tag.
  if new.gueltig and new.fuellstand_prozent is not null then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'messfehler' and geschlossen_am is null;
  end if;

  if not new.gueltig then
    return new;
  end if;

  -- Vorherigen Fuellstand merken (fuer die Leerungserkennung)
  select fuellstand_prozent into v_vorher
    from public.container_zustand
   where container_id = new.container_id;

  -- Zustand nur fortschreiben, wenn die Messung neuer ist als die gespeicherte
  insert into public.container_zustand as z (
    container_id, sensor_id, fuellstand_prozent, abstand_mm,
    gemessen_am, batterie_v, batterie_prozent, rssi, lage, geaendert_am
  )
  values (
    new.container_id, new.sensor_id, new.fuellstand_prozent, new.abstand_mm,
    new.gemessen_am, new.batterie_v, new.batterie_prozent, new.rssi, new.lage, now()
  )
  on conflict (container_id) do update
    set sensor_id = excluded.sensor_id,
        fuellstand_prozent = excluded.fuellstand_prozent,
        abstand_mm = excluded.abstand_mm,
        gemessen_am = excluded.gemessen_am,
        batterie_v = excluded.batterie_v,
        batterie_prozent = excluded.batterie_prozent,
        rssi = excluded.rssi,
        lage = coalesce(excluded.lage, z.lage),
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
-- e) Der Sensor meldet, aber nichts Brauchbares
--
-- Gefragt ist der ganze Tag, nicht die einzelne Meldung. Zwei Bedingungen
-- muessen zusammenkommen:
--
--   * im Fenster kamen mindestens `messfehler_min_meldungen` Meldungen an -
--     sonst ist es ein Funkproblem und Sache von "kein Signal"
--   * KEINE davon trug einen brauchbaren Fuellstand
--
-- Das Fenster ist mindestens `messfehler_stunden` lang, bei traegen Geraeten
-- aber das Dreifache ihres Sendeintervalls: ein Geraet, das nur einmal am Tag
-- meldet, kaeme in 24 Stunden sonst nie auf drei Meldungen und koennte den
-- Alarm nie ausloesen.
-- ---------------------------------------------------------------------------
create or replace function public.pruefe_messfehler()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stunden numeric := public.einstellung_zahl('messfehler_stunden', 24);
  v_min     integer := greatest(1, public.einstellung_zahl('messfehler_min_meldungen', 3)::integer);
  v_anzahl  integer := 0;
begin
  with fenster as (
    select s.id as sensor_id,
           s.container_id,
           now() - make_interval(mins => greatest(v_stunden * 60, s.intervall_minuten * 3)::integer) as ab
      from public.sensor s
     where s.status = 'angelernt'
       and s.container_id is not null
  ),
  bilanz as (
    select f.sensor_id,
           f.container_id,
           f.ab,
           count(m.id) as meldungen,
           count(m.id) filter (where m.gueltig and m.fuellstand_prozent is not null) as brauchbar
      from fenster f
      left join public.messung m
        on m.sensor_id = f.sensor_id and m.gemessen_am >= f.ab
     group by f.sensor_id, f.container_id, f.ab
  )
  insert into public.alarm (container_id, sensor_id, typ, wert, text)
  select b.container_id, b.sensor_id, 'messfehler', b.meldungen,
         format('%s Meldungen seit %s, keine davon mit brauchbarem Messwert.',
                b.meldungen, to_char(b.ab, 'DD.MM.YYYY HH24:MI'))
    from bilanz b
   where b.meldungen >= v_min
     and b.brauchbar = 0
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.pruefe_messfehler is
  'Oeffnet "messfehler" fuer Sensoren, die melden, aber ueber das ganze Fenster keinen brauchbaren Wert liefern.';

-- ---------------------------------------------------------------------------
-- f) Kein Signal - jetzt am Sendeintervall gemessen
--
-- Neu gegenueber 0002: die Untergrenze ist das doppelte Sendeintervall des
-- GERAETS. Ein Container, der einmal taeglich meldet, war mit einer festen
-- 24-Stunden-Grenze im Dauerallarm; ein Geraet im Minutentakt darf trotzdem
-- einen vollen Tag schweigen, bevor jemand hinfaehrt - so steht es in der
-- Aufgabe, und so ist es auch richtig: einzelne Aussetzer sind Funk.
-- ---------------------------------------------------------------------------
create or replace function public.pruefe_stille_sensoren()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stunden numeric := public.einstellung_zahl('max_stille_stunden', 24);
  v_anzahl  integer := 0;
begin
  with kandidaten as (
    select s.id as sensor_id, s.container_id, s.letzte_meldung_am,
           greatest(v_stunden * 60, s.intervall_minuten * 2)::integer as stille_minuten
      from public.sensor s
     where s.status = 'angelernt'
       and s.container_id is not null
  )
  insert into public.alarm (container_id, sensor_id, typ, text)
  select k.container_id, k.sensor_id, 'kein_signal',
         case
           when k.letzte_meldung_am is null then 'Sensor hat noch nie gemeldet.'
           else format('Keine Meldung seit %s.', to_char(k.letzte_meldung_am, 'DD.MM.YYYY HH24:MI'))
         end
    from kandidaten k
   where k.letzte_meldung_am is null
      or k.letzte_meldung_am < now() - make_interval(mins => k.stille_minuten)
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

comment on function public.pruefe_stille_sensoren is
  'Oeffnet "kein Signal" fuer Sensoren, von denen laenger nichts kam als max_stille_stunden bzw. das doppelte Sendeintervall.';

-- ---------------------------------------------------------------------------
-- g) Ein Einstieg fuer den stuendlichen Lauf
--
-- Die beiden Pruefungen bleiben getrennt - sie beantworten verschiedene
-- Fragen und lassen sich einzeln von Hand ausloesen. Aufgerufen wird
-- trotzdem nur eine Stelle, damit eine dritte Pruefung spaeter an genau
-- einem Ort dazukommt und nicht an dreien vergessen wird.
-- ---------------------------------------------------------------------------
create or replace function public.pruefe_sensoren()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.pruefe_stille_sensoren() + public.pruefe_messfehler();
end;
$$;

comment on function public.pruefe_sensoren is
  'Stuendlicher Lauf: stille Sensoren und Sensoren ohne brauchbare Werte.';

-- Der Cron-Eintrag aus 0006 ruft noch den alten Namen. Bei Supabase laeuft
-- er, im Docker-Betrieb gibt es ihn nicht (dort uebernimmt der Dienst "cron"
-- ueber /api/cron/pruefen) - deshalb wird er nur angefasst, wenn er da ist.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule('stille-sensoren-pruefen')
      where exists (select 1 from cron.job where jobname = 'stille-sensoren-pruefen');
    perform cron.schedule('sensoren-pruefen', '17 * * * *', 'select public.pruefe_sensoren();');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- h) Rechte
--
-- PostgreSQL vergibt EXECUTE auf jede neue Funktion an PUBLIC - ohne diese
-- Zeilen waeren die Pruefungen ueber /rest/v1/rpc/... ohne Anmeldung
-- ausloesbar (Begruendung in 0005_funktionsrechte.sql).
-- ---------------------------------------------------------------------------
revoke execute on function public.pruefe_messfehler()      from public, anon, authenticated;
revoke execute on function public.pruefe_sensoren()        from public, anon, authenticated;
revoke execute on function public.pruefe_stille_sensoren() from public, anon, authenticated;
