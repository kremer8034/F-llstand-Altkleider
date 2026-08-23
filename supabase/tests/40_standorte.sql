\set ON_ERROR_STOP on
\pset pager off

-- ===========================================================================
-- Standorte, Kosten, Deckung und Buergermeldung
-- (0011_standorte.sql, 0012_regeltouren.sql, 0013_buergermeldung.sql)
--
-- Kalibrierung wie in 30_prognose.sql: leer 1000 mm, voll 200 mm, Versatz 0,
-- also fuellstand_% = (1000 - abstand_mm) / 8. Damit sind
--
--     240 mm =  95 %      920 mm = 10 %
--
-- Volumen 2500 l je Container (Ersatzwert aus standard_volumen_liter),
-- Reserve 20 %.
-- ===========================================================================

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data)
values ('44444444-4444-4444-4444-444444444444', 'dispo2@brk-mill.de', '{"name":"Dispo Zwei"}'::jsonb)
on conflict do nothing;
set test.uid = '44444444-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
\echo '=== 1. Das Cluster aus dem Konzeptpapier: sieben Container, fuenf voll ==='
-- docs/tourenplanung.md rechnet dieses Beispiel vor. Wenn die Datenbank hier
-- etwas anderes sagt als das Papier, ist eines von beidem falsch.
-- ---------------------------------------------------------------------------
insert into public.standort (name, ort, lat, lng)
values ('Cluster Wertstoffhof', 'Miltenberg', 49.7040, 9.2530);

insert into public.container (nummer, bezeichnung, ort, lat, lng,
                              leer_abstand_mm, voll_abstand_mm, standort_id)
select 'C-' || lpad(i::text, 3, '0'), 'Cluster ' || i, 'Miltenberg', 49.7040, 9.2530,
       1000, 200, (select id from public.standort where name='Cluster Wertstoffhof')
from generate_series(1, 7) i;

insert into public.sensor (geraete_id, container_id, status, montage_offset_mm)
select 'CS-' || c.nummer, c.id, 'angelernt', 0
from public.container c where c.nummer like 'C-0%';

-- Fuenf bei 95 %, zwei bei 10 %. Genau eine Messung je Container: ohne zweite
-- Messung gibt es keine Steigung und damit bewusst keinen Zufluss - hier wird
-- die statische Rechnung geprueft, nicht die Vorausschau.
insert into public.messung (sensor_id, container_id, gemessen_am, abstand_mm)
select s.id, s.container_id, now(),
       case when c.nummer in ('C-006', 'C-007') then 920 else 240 end
from public.sensor s join public.container c on c.id = s.container_id
where s.geraete_id like 'CS-C-0%';

select name, container_gesamt, container_voll, kapazitaet_liter, gefuellt_liter,
       freie_liter, freie_prozent
from public.standort_zustand where name = 'Cluster Wertstoffhof';

do $$
declare v_kap numeric; v_frei numeric; v_proz numeric; v_voll integer; v_zustand text;
begin
  select kapazitaet_liter, freie_liter, freie_prozent, container_voll
    into v_kap, v_frei, v_proz, v_voll
    from public.standort_zustand where name = 'Cluster Wertstoffhof';

  if v_kap  <> 17500 then raise exception 'FEHLER: Kapazitaet % statt 17500 l', v_kap;  end if;
  if v_frei <>  5125 then raise exception 'FEHLER: frei % statt 5125 l', v_frei;        end if;
  if round(v_proz, 1) <> 29.3 then raise exception 'FEHLER: % Prozent frei statt 29,3', v_proz; end if;
  if v_voll <> 5 then raise exception 'FEHLER: % volle Container statt 5', v_voll;      end if;

  -- 29,3 % frei liegt ueber der Reserve von 20 % - der Stopp kann warten.
  -- Das ist die Aussage, um die es dem Auftraggeber ging.
  select zustand into v_zustand from public.standort_planung where name = 'Cluster Wertstoffhof';
  if v_zustand <> 'ruht' then raise exception 'FEHLER: Cluster steht auf % statt ruht', v_zustand; end if;

  raise notice 'korrekt: 17500 l Kapazitaet, 5125 l frei, 29,3 Prozent - der Stopp ruht';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 2. Erst wenn auch die beiden freien vollaufen, wird der Stopp Pflicht ==='
-- ---------------------------------------------------------------------------
insert into public.messung (sensor_id, container_id, gemessen_am, abstand_mm)
select s.id, s.container_id, now() + interval '1 minute', 240
from public.sensor s join public.container c on c.id = s.container_id
where c.nummer in ('C-006', 'C-007');

do $$
declare v_proz numeric; v_zustand text; v_grund text; v_gedeckt boolean;
begin
  select freie_prozent, zustand, grund, gedeckt into v_proz, v_zustand, v_grund, v_gedeckt
    from public.standort_planung where name = 'Cluster Wertstoffhof';

  if round(v_proz) <> 5 then raise exception 'FEHLER: % Prozent frei statt 5', v_proz; end if;
  if v_zustand <> 'pflicht' then raise exception 'FEHLER: Cluster steht auf % statt pflicht', v_zustand; end if;
  if v_grund <> 'ungedeckt' then raise exception 'FEHLER: Grund % statt ungedeckt', v_grund; end if;
  if v_gedeckt then raise exception 'FEHLER: ohne Regeltour darf nichts gedeckt sein'; end if;

  raise notice 'korrekt: 5 Prozent frei, keine Regeltour - Pflichtstopp, Grund ungedeckt';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 3. Eine Regeltour deckt den Standort ab ==='
-- Der Wochentag wird aus dem Ankerdatum abgeleitet - die Pruefbedingung
-- route_anker_passt verlangt, dass beides zusammenpasst. Der Anker liegt
-- vierzehn Tage zurueck, damit der naechste Termin unabhaengig davon, an
-- welchem Tag der Test laeuft, im Zweiwochenraster berechnet werden muss.
-- ---------------------------------------------------------------------------
insert into public.route (name, wochentag, intervall_wochen, anker_datum)
values ('Nord, alle zwei Wochen',
        extract(isodow from current_date - 14)::smallint, 2, current_date - 14);

insert into public.route_standort (route_id, standort_id)
select r.id, s.id from public.route r, public.standort s
where r.name = 'Nord, alle zwei Wochen' and s.name = 'Cluster Wertstoffhof';

select name, naechster_planbesuch_am, routenname, gedeckt, zustand, grund
from public.standort_planung where name = 'Cluster Wertstoffhof';

do $$
declare v_termin date; v_zustand text; v_grund text; v_gedeckt boolean; v_route text;
begin
  select naechster_planbesuch_am, routenname, gedeckt, zustand, grund
    into v_termin, v_route, v_gedeckt, v_zustand, v_grund
    from public.standort_planung where name = 'Cluster Wertstoffhof';

  if v_termin is null then raise exception 'FEHLER: kein Planbesuch berechnet'; end if;
  if v_termin < current_date then raise exception 'FEHLER: Planbesuch % liegt in der Vergangenheit', v_termin; end if;
  if extract(isodow from v_termin) <> extract(isodow from current_date - 14) then
    raise exception 'FEHLER: Planbesuch % faellt auf den falschen Wochentag', v_termin;
  end if;
  if (v_termin - (current_date - 14)) % 14 <> 0 then
    raise exception 'FEHLER: Planbesuch % liegt nicht im Zweiwochenraster', v_termin;
  end if;
  if v_route is null then raise exception 'FEHLER: Routenname fehlt'; end if;
  if not v_gedeckt then raise exception 'FEHLER: mit Regeltour muss der Standort gedeckt sein'; end if;

  -- Gedeckt heisst nicht unsichtbar: der Stopp bleibt als Kann-Stopp in der
  -- Liste, damit ihn die Disposition bei kleinem Umweg mitnehmen kann.
  if v_zustand <> 'kann' then raise exception 'FEHLER: gedeckter Standort steht auf % statt kann', v_zustand; end if;
  if v_grund <> 'mitnahme' then raise exception 'FEHLER: Grund % statt mitnahme', v_grund; end if;

  raise notice 'korrekt: Regeltour deckt ab - aus Pflicht wird Kann (%)', v_termin;
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 4. Eine offene Meldung ueberstimmt die Deckung ==='
-- Regel 2 aus docs/tourenplanung.md, Abschnitt 5.
-- ---------------------------------------------------------------------------
insert into public.meldung (container_id, typ, quelle, text)
select id, 'voll', 'intern', 'Testmeldung' from public.container where nummer = 'C-001';

do $$
declare v_zustand text; v_grund text; v_anzahl bigint;
begin
  select zustand, grund, offene_meldungen into v_zustand, v_grund, v_anzahl
    from public.standort_planung where name = 'Cluster Wertstoffhof';

  if v_anzahl <> 1 then raise exception 'FEHLER: % offene Meldungen statt 1', v_anzahl; end if;
  if v_zustand <> 'pflicht' then raise exception 'FEHLER: trotz Meldung nur %', v_zustand; end if;
  if v_grund <> 'meldung' then raise exception 'FEHLER: Grund % statt meldung', v_grund; end if;

  raise notice 'korrekt: offene Meldung macht aus Kann wieder Pflicht';
end $$;

update public.meldung set erledigt_am = now()
where container_id = (select id from public.container where nummer = 'C-001');

-- ---------------------------------------------------------------------------
\echo '=== 5. Ein Container ohne Standort faellt aus der Planung ==='
-- Kein Fehler, sondern eine Eigenschaft des Modells - die Planung geht vom
-- Standort aus. Die Oberflaeche weist unter /intern/standorte darauf hin.
-- ---------------------------------------------------------------------------
insert into public.container (nummer, bezeichnung, ort, lat, lng, leer_abstand_mm, voll_abstand_mm)
values ('C-900', 'Ohne Standort', 'Amorbach', 49.64, 9.20, 1000, 200);

do $$
declare v integer;
begin
  select count(*) into v
    from public.standort_zustand z
    join public.container c on c.standort_id = z.standort_id
   where c.nummer = 'C-900';
  if v <> 0 then raise exception 'FEHLER: C-900 hat keinen Standort, taucht aber % mal auf', v; end if;
  raise notice 'korrekt: Container ohne Standort erscheint in keiner Planung';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 6. Buergermeldung ueber den QR-Code ==='
-- ---------------------------------------------------------------------------
insert into public.standort (name, ort, lat, lng) values ('Buergerplatz', 'Kleinheubach', 49.72, 9.19);
insert into public.container (nummer, bezeichnung, ort, lat, lng, standort_id)
values ('C-800', 'Am Buergerplatz', 'Kleinheubach', 49.72, 9.19,
        (select id from public.standort where name='Buergerplatz'));

do $$
declare v jsonb; v_id uuid; v_anzahl smallint; v_zeilen integer; v_zeit timestamptz;
begin
  select id into v_id from public.container where nummer = 'C-800';

  v := public.meldung_oeffentlich(v_id);
  if not (v->>'ok')::boolean then raise exception 'FEHLER: erste Meldung abgelehnt (%)', v; end if;
  if not (v->>'neu')::boolean then raise exception 'FEHLER: erste Meldung nicht als neu gefuehrt'; end if;

  select gemeldet_am into v_zeit from public.meldung
   where container_id = v_id and quelle = 'oeffentlich';

  -- Fuenfzig Knopfdruecke duerfen genau eine Meldung ergeben, und der Zaehler
  -- darf die Obergrenze aus meldung_hoechstzahl nicht ueberschreiten.
  for i in 1..49 loop
    perform public.meldung_oeffentlich(v_id);
  end loop;

  select count(*) into v_zeilen from public.meldung
   where container_id = v_id and quelle = 'oeffentlich';
  if v_zeilen <> 1 then raise exception 'FEHLER: 50 Meldungen ergaben % Eintraege statt 1', v_zeilen; end if;

  select anzahl into v_anzahl from public.meldung
   where container_id = v_id and quelle = 'oeffentlich';
  if v_anzahl <> 25 then raise exception 'FEHLER: Zaehler steht auf % statt auf der Obergrenze 25', v_anzahl; end if;

  -- Der Zeitstempel darf sich im Fenster NICHT verschieben, sonst liesse sich
  -- das Zusammenfassen durch Dauerdruecken endlos verlaengern.
  if (select gemeldet_am from public.meldung where container_id = v_id and quelle = 'oeffentlich') <> v_zeit then
    raise exception 'FEHLER: der Zeitstempel wurde im Fenster nachgezogen';
  end if;

  raise notice 'korrekt: 50 Knopfdruecke = 1 Meldung, Zaehler bei 25, Zeitstempel unveraendert';
end $$;

do $$
declare v jsonb;
begin
  v := public.meldung_oeffentlich('00000000-0000-0000-0000-000000000000'::uuid);
  if (v->>'ok')::boolean then raise exception 'FEHLER: unbekannter Container wurde angenommen'; end if;
  if v->>'grund' <> 'unbekannt' then raise exception 'FEHLER: Grund % statt unbekannt', v->>'grund'; end if;
  raise notice 'korrekt: unbekannter Container abgelehnt';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 7. Was der Buerger darf - und was nicht ==='
-- Die Container-Kennung wird VOR dem Rollenwechsel aufgeloest und in einer
-- Sitzungsvariablen abgelegt: anon darf public.container nicht lesen, und
-- genau das gehoert zum erwarteten Verhalten. (psql ersetzt :'name' nicht
-- innerhalb von $$-Bloecken, deshalb der Umweg ueber set_config.)
--
-- Zu den Erwartungen: die Testdateien davor vergeben in diesem Cluster
-- flaechendeckend Tabellenrechte an anon, damit sie die Zugriffsregeln pruefen
-- statt der Rechte. Ein Lesezugriff kann deshalb je nach Reihenfolge entweder
-- abgelehnt werden oder null Zeilen liefern. Beides ist richtig - falsch waere
-- nur eine Zeile. Genau das wird hier geprueft.
-- ---------------------------------------------------------------------------
select set_config('test.cid', (select id::text from public.container where nummer = 'C-800'), false);

set test.uid = '';
set role anon;

do $$
declare v jsonb;
begin
  v := public.meldung_oeffentlich(current_setting('test.cid')::uuid);
  if not (v->>'ok')::boolean then raise exception 'FEHLER: anon darf nicht melden (%)', v; end if;
  raise notice 'korrekt: anon darf melden';
end $$;

do $$
declare v integer;
begin
  begin
    select count(*) into v from public.meldung;
    if v <> 0 then raise exception 'FEHLER: anon sieht % Meldungen', v; end if;
    raise notice 'korrekt: anon sieht keine Meldungen';
  exception when insufficient_privilege then
    raise notice 'korrekt abgelehnt: anon darf Meldungen nicht lesen';
  end;
end $$;

do $$
begin
  begin
    insert into public.meldung (container_id, typ, quelle)
    values (current_setting('test.cid')::uuid, 'voll', 'oeffentlich');
    raise exception 'FEHLER: anon konnte direkt in meldung schreiben';
  exception when insufficient_privilege then
    raise notice 'korrekt abgelehnt: anon darf nicht direkt schreiben';
  end;
end $$;

do $$
declare v integer;
begin
  begin
    select count(*) into v from public.container;
    if v <> 0 then raise exception 'FEHLER: anon sieht % Container in der Rohtabelle', v; end if;
    raise notice 'korrekt: Rohtabelle fuer anon leer';
  exception when insufficient_privilege then
    raise notice 'korrekt abgelehnt: anon darf container nicht lesen';
  end;
end $$;

do $$
declare v integer;
begin
  begin
    select count(*) into v from public.standort_planung;
    if v <> 0 then raise exception 'FEHLER: anon sieht % Zeilen der Planung', v; end if;
    raise notice 'korrekt: Planung fuer anon leer';
  exception when insufficient_privilege then
    raise notice 'korrekt abgelehnt: anon darf die Planung nicht lesen';
  end;
end $$;

do $$
declare v integer;
begin
  begin
    perform public.tourenplanung();
    raise exception 'FEHLER: anon konnte die Tourenplanung aufrufen';
  exception when insufficient_privilege then
    raise notice 'korrekt abgelehnt: anon darf tourenplanung() nicht aufrufen';
  end;
end $$;

do $$
declare v integer;
begin
  select count(*) into v from public.oeffentliche_container;
  raise notice 'korrekt: anon sieht % oeffentliche Container', v;
end $$;

reset role;
\echo '=== 40_standorte.sql durchgelaufen ==='
