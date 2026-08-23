\set ON_ERROR_STOP on
\pset pager off

-- ===========================================================================
-- Prognose und Leerungsrhythmus (0010_prognose.sql)
--
-- Die Zahlen sind so gewaehlt, dass sie sich im Kopf nachrechnen lassen:
-- Kalibrierung leer 1000 mm / voll 200 mm, Montageversatz 0. Damit gilt
--
--     fuellstand_% = (1000 - abstand_mm) / 8
--
-- also 1000 mm = 0 %, 600 mm = 50 %, 440 mm = 70 %.
-- ===========================================================================

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values ('33333333-3333-3333-3333-333333333333', 'dispo@brk-mill.de', '{"name":"Dispo"}'::jsonb)
on conflict do nothing;
set test.uid = '33333333-3333-3333-3333-333333333333';

\echo '=== Aufbau: drei Container mit Sensor und Kalibrierung ==='
insert into public.container (nummer, bezeichnung, ort, lat, lng, leer_abstand_mm, voll_abstand_mm)
values
  ('P-001', 'Gleichmaessig alle 20 Tage', 'Miltenberg',   49.70, 9.25, 1000, 200),
  ('P-002', 'Haeufig, ungleichmaessig',   'Erlenbach',    49.80, 9.16, 1000, 200),
  ('P-003', 'Wird demnaechst faellig',    'Klingenberg',  49.78, 9.18, 1000, 200),
  ('P-004', 'Noch keine Daten',           'Amorbach',     49.64, 9.20, 1000, 200);

insert into public.sensor (geraete_id, container_id, status, montage_offset_mm)
select 'PS-' || c.nummer, c.id, 'angelernt', 0 from public.container c where c.nummer like 'P-00%';

\echo '=== 1. Leerungen: gleichmaessig 20 Tage gegen ungleichmaessig 10/15 Tage ==='
-- P-001: -60, -40, -20  -> Abstaende 20 und 20 Tage
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '60 days', 'manuell' from public.container where nummer='P-001';
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '40 days', 'manuell' from public.container where nummer='P-001';
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '20 days', 'manuell' from public.container where nummer='P-001';

-- P-002: -30, -20, -5 -> Abstaende 10 und 15 Tage
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '30 days', 'manuell' from public.container where nummer='P-002';
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '20 days', 'manuell' from public.container where nummer='P-002';
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '5 days', 'manuell' from public.container where nummer='P-002';
-- Dazu eine Doppelerfassung zwei Stunden spaeter: darf den Mittelwert NICHT
-- verschieben (Grenze leerung_min_abstand_stunden = 12).
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '5 days' + interval '2 hours', 'manuell' from public.container where nummer='P-002';

-- P-003: eine einzige Leerung -> kein Abstand berechenbar
insert into public.leerung (container_id, geleert_am, art)
select id, now() - interval '9 days', 'manuell' from public.container where nummer='P-003';

select nummer, leerungen_gesamt, abstaende_anzahl, mittel_tage, streuung_tage,
       kuerzester_abstand_tage, laengster_abstand_tage, leerungen_pro_jahr
from public.container_rhythmus where nummer like 'P-00%' order by nummer;

do $$
declare v numeric;
begin
  select mittel_tage into v from public.container_rhythmus where nummer='P-001';
  if v is distinct from 20.0 then raise exception 'FEHLER: P-001 Mittelwert % statt 20.0', v; end if;

  select mittel_tage into v from public.container_rhythmus where nummer='P-002';
  if v is distinct from 12.5 then raise exception 'FEHLER: P-002 Mittelwert % statt 12.5 (Doppelerfassung nicht ausgesondert?)', v; end if;

  select abstaende_anzahl into v from public.container_rhythmus where nummer='P-002';
  if v <> 2 then raise exception 'FEHLER: P-002 zaehlt % Abstaende statt 2', v; end if;

  select leerungen_pro_jahr into v from public.container_rhythmus where nummer='P-001';
  if round(v) <> 18 then raise exception 'FEHLER: P-001 % Leerungen/Jahr statt rund 18', v; end if;

  select abstaende_anzahl into v from public.container_rhythmus where nummer='P-003';
  if v <> 0 then raise exception 'FEHLER: P-003 hat nur eine Leerung, darf keinen Abstand melden'; end if;

  raise notice 'korrekt: Mittelwerte stimmen, Doppelerfassung ausgesondert';
end $$;

\echo '=== 2. Der haeufiger geleerte Container steht in der Rangliste vorn ==='
select nummer, mittel_tage, leerungen_pro_jahr
from public.container_rhythmus
where abstaende_anzahl > 0
order by leerungen_pro_jahr desc;

\echo '=== 3. Messreihen im laufenden Zyklus ==='
-- Reihenfolge beachten: generate_series laeuft rueckwaerts, damit die aeltesten
-- Messungen zuerst eingefuegt werden. Andersherum sieht messung_nachbereiten
-- beim Nachtragen einen Sprung von 50 % auf 0 % und legt eine Leerung an, die
-- es nie gab - historische Daten gehoeren chronologisch eingespielt.

-- P-001: elf Tage lang 40 mm je Tag -> 5 Prozentpunkte je Tag, aktuell 50 %
insert into public.messung (sensor_id, container_id, gemessen_am, abstand_mm)
select s.id, s.container_id, now() - make_interval(days => i), 600 + 40 * i
from public.sensor s, generate_series(10, 0, -1) i
where s.geraete_id = 'PS-P-001';

-- P-003: derselbe Anstieg, aber schon bei 70 % -> in einem Tag faellig
insert into public.messung (sensor_id, container_id, gemessen_am, abstand_mm)
select s.id, s.container_id, now() - make_interval(days => i), 440 + 40 * i
from public.sensor s, generate_series(8, 0, -1) i
where s.geraete_id = 'PS-P-003';

select nummer, fuellstand_prozent, rate_messung, rate_historie, rate_prozent_pro_tag,
       tage_bis_tour, tage_bis_voll, grundlage
from public.container_prognose where nummer like 'P-00%' order by nummer;

do $$
declare
  v_rate numeric; v_tour numeric; v_voll numeric; v_grund text; v_stand smallint;
begin
  select fuellstand_prozent, rate_prozent_pro_tag, tage_bis_tour, tage_bis_voll, grundlage
    into v_stand, v_rate, v_tour, v_voll, v_grund
    from public.container_prognose where nummer='P-001';

  if v_stand <> 50 then raise exception 'FEHLER: P-001 steht bei % %% statt 50', v_stand; end if;
  -- Messung 5,0 und Historie 100/20 = 5,0 - die Mischung muss wieder 5,0 sein
  if round(v_rate, 1) <> 5.0 then raise exception 'FEHLER: P-001 Rate % statt 5.0', v_rate; end if;
  if round(v_tour) <> 5 then raise exception 'FEHLER: P-001 % Tage bis zur Tourenschwelle statt 5', v_tour; end if;
  if round(v_voll) <> 8 then raise exception 'FEHLER: P-001 % Tage bis voll statt 8', v_voll; end if;
  if v_grund <> 'messung_und_historie' then raise exception 'FEHLER: P-001 Grundlage % statt messung_und_historie', v_grund; end if;

  select grundlage into v_grund from public.container_prognose where nummer='P-004';
  if v_grund <> 'keine' then raise exception 'FEHLER: P-004 hat keine Daten, meldet aber Grundlage %', v_grund; end if;

  raise notice 'korrekt: Rate 5,0 %%/Tag, in 5 Tagen Tour, in 8 Tagen voll';
end $$;

\echo '=== 4. Tourenliste nimmt auf, was demnaechst faellig wird ==='
select nummer, fuellstand_prozent, grund, tage_bis_tour, round(prioritaet) as prio
from public.tourenliste(null) where nummer like 'P-00%' order by prio desc;

do $$
declare v_grund text; v_dabei integer;
begin
  -- P-003 liegt bei 70 %, also unter der Schwelle von 75 - ohne Prognose waere
  -- er nicht dabei. Mit Vorlauf von drei Tagen muss er auftauchen.
  select count(*) into v_dabei from public.tourenliste(null) where nummer='P-003';
  if v_dabei <> 1 then raise exception 'FEHLER: P-003 fehlt in der Tourenliste'; end if;

  select grund into v_grund from public.tourenliste(null) where nummer='P-003';
  if v_grund <> 'prognose' then raise exception 'FEHLER: P-003 steht mit Grund % statt prognose', v_grund; end if;

  -- P-001 liegt bei 50 % und ist erst in fuenf Tagen dran - noch nicht auf der Tour
  select count(*) into v_dabei from public.tourenliste(null) where nummer='P-001';
  if v_dabei <> 0 then raise exception 'FEHLER: P-001 ist erst in 5 Tagen faellig, steht aber schon auf der Tour'; end if;

  raise notice 'korrekt: vorausschauend aufgenommen, aber nicht zu frueh';
end $$;

\echo '=== 5. Vorlauf laesst sich steuern ==='
select 'Vorlauf 0 Tage' as fall, count(*) as p003_dabei from public.tourenliste(null, 0) where nummer='P-003'
union all
select 'Vorlauf 7 Tage', count(*) from public.tourenliste(null, 7) where nummer='P-001';

\echo '=== 6. Ohne Anmeldung gibt es keine Auswertung ==='
-- Was hier wirklich schuetzt, ist nicht das Recht auf der Ansicht: Supabase
-- vergibt Tabellenrechte an anon ohnehin flaechendeckend, und dieser Test tut
-- oben dasselbe. Es ist security_invoker = true - damit gelten beim Lesen die
-- Zugriffsregeln der Rohtabellen, und die verlangen eine Anmeldung. Geprueft
-- wird deshalb, dass keine Zeile herauskommt, nicht dass es knallt.
do $$
declare v_rhythmus integer; v_prognose integer;
begin
  set local role anon;
  select count(*) into v_rhythmus from public.container_rhythmus;
  select count(*) into v_prognose from public.container_prognose;
  reset role;

  if v_rhythmus <> 0 then
    raise exception 'FEHLER: anon sieht % Zeilen in container_rhythmus', v_rhythmus;
  end if;
  if v_prognose <> 0 then
    raise exception 'FEHLER: anon sieht % Zeilen in container_prognose', v_prognose;
  end if;
  raise notice 'korrekt: anon sieht keine Zeile - die Regeln der Rohtabellen greifen durch';
end $$;
