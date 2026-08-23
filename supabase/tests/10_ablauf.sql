\set ON_ERROR_STOP on
\pset pager off

-- Wie in Supabase: anon/authenticated bekommen die Tabellenrechte, der
-- eigentliche Schutz kommt aus den RLS-Regeln.
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

\echo '=== 1. Erster Benutzer wird automatisch Administrator ==='
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'chef@brk-mill.de', '{"name":"Chef"}'::jsonb);
insert into auth.users (id, email, raw_user_meta_data)
values ('22222222-2222-2222-2222-222222222222', 'fahrer@brk-mill.de', '{"name":"Fahrer"}'::jsonb);
select name, rolle from public.benutzerprofil order by angelegt_am;

set test.uid = '11111111-1111-1111-1111-111111111111';
select public.aktuelle_rolle() as rolle, public.ist_admin() as admin, public.ist_mindestens_dispo() as dispo;

\echo '=== 2. Container und Sensor anlegen ==='
insert into public.container (nummer, bezeichnung, ort, lat, lng, aufstelldatum)
values ('T-001', 'Testplatz', 'Grossheubach', 49.7333, 9.2167, current_date - 400);

insert into public.sensor (geraete_id, montage_offset_mm) values ('ALT-9001', 50);
insert into public.sensor_geheimnis (sensor_id, geheimnis)
select id, repeat('ab', 32) from public.sensor where geraete_id = 'ALT-9001';
insert into public.anlerncode (sensor_id, code)
select id, 'TEST-CODE' from public.sensor where geraete_id = 'ALT-9001';

\echo '=== 3. Verheiraten (auch mit Kleinschreibung und ohne Bindestrich) ==='
select public.sensor_koppeln('testcode', (select id from public.container where nummer='T-001'),
                             49.7333, 9.2167, false, 'Testkopplung');

select s.status, s.container_id is not null as gekoppelt,
       (select count(*) from public.sensor_kopplung k where k.sensor_id = s.id and k.getrennt_am is null) as aktive_kopplungen,
       (select verbraucht_am is not null from public.anlerncode a where a.sensor_id = s.id) as code_verbraucht
from public.sensor s where s.geraete_id = 'ALT-9001';

\echo '=== 4. Zweite Kopplung ohne "ersetzen" muss scheitern ==='
insert into public.anlerncode (sensor_id, code)
select id, 'ZWEI-CODE' from public.sensor where geraete_id = 'ALT-9001';
insert into public.container (nummer, ort) values ('T-002', 'Kleinheubach');
do $$
begin
  perform public.sensor_koppeln('ZWEI-CODE', (select id from public.container where nummer='T-002'));
  raise exception 'FEHLER: haette abgelehnt werden muessen';
exception when sqlstate 'P0001' then
  raise notice 'korrekt abgelehnt: %', sqlerrm;
end $$;

\echo '=== 5. Messungen ohne Kalibrierung: kein Prozentwert ==='
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v, rssi)
select id, now() - interval '30 minutes', 1400, 3.95, -91 from public.sensor where geraete_id='ALT-9001';
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v, rssi)
select id, now() - interval '20 minutes', 1398, 3.95, -90 from public.sensor where geraete_id='ALT-9001';
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v, rssi)
select id, now() - interval '10 minutes', 1402, 3.94, -92 from public.sensor where geraete_id='ALT-9001';
select abstand_mm, fuellstand_prozent, gueltig from public.messung order by gemessen_am;

\echo '=== 6. Kalibrieren: Median der letzten Messungen, dann Rueckrechnung ==='
select public.container_kalibrieren((select id from public.container where nummer='T-001'));
select nummer, leer_abstand_mm, voll_abstand_mm from public.container where nummer='T-001';
select abstand_mm, fuellstand_prozent from public.messung order by gemessen_am;
select fuellstand_prozent, abstand_mm from public.container_zustand
where container_id = (select id from public.container where nummer='T-001');

\echo '=== 7. Container laeuft voll -> Alarm ==='
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v)
select id, now() - interval '5 minutes', 700, 3.9 from public.sensor where geraete_id='ALT-9001';
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v)
select id, now() - interval '4 minutes', 300, 3.9 from public.sensor where geraete_id='ALT-9001';
select fuellstand_prozent, public.fuellstand_stufe(fuellstand_prozent) as stufe
from public.container_zustand where container_id=(select id from public.container where nummer='T-001');
select typ, text, geschlossen_am is null as offen from public.alarm order by ausgeloest_am;

\echo '=== 8. Leerung wird aus dem Sprung erkannt und schliesst den Alarm ==='
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v)
select id, now() - interval '1 minute', 1395, 3.9 from public.sensor where geraete_id='ALT-9001';
select art, fuellstand_vorher, fuellstand_nachher from public.leerung;
select typ, geschlossen_am is null as offen from public.alarm where typ='fuellstand';

\echo '=== 9. Doppelte Uebertragung derselben Messung ==='
do $$
declare v_zeit timestamptz;
begin
  select gemessen_am into v_zeit from public.messung order by gemessen_am desc limit 1;
  begin
    insert into public.messung (sensor_id, gemessen_am, abstand_mm)
    select id, v_zeit, 1395 from public.sensor where geraete_id='ALT-9001';
    raise exception 'FEHLER: Dublette wurde angenommen';
  exception when unique_violation then
    raise notice 'korrekt als Dublette erkannt';
  end;
end $$;

\echo '=== 10. Batteriealarm ==='
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v)
select id, now(), 1390, 3.2 from public.sensor where geraete_id='ALT-9001';
select typ, wert, geschlossen_am is null as offen from public.alarm where typ='batterie_schwach';

\echo '=== 11. Tourenliste ==='
insert into public.messung (sensor_id, gemessen_am, abstand_mm, batterie_v)
select id, now() + interval '1 minute', 260, 3.8 from public.sensor where geraete_id='ALT-9001';
select nummer, fuellstand_prozent, offene_meldungen, round(prioritaet) as prio from public.tourenliste(null);

\echo '=== 12. Stille Sensoren ==='
update public.sensor set letzte_meldung_am = now() - interval '3 days' where geraete_id='ALT-9001';
select public.pruefe_stille_sensoren() as neue_alarme;
select typ, text from public.alarm where typ='kein_signal';

\echo '=== 13. Oeffentliche Ansicht ==='
select nummer, fuellstand_prozent, stufe, standtage > 300 as lange_am_standort
from public.oeffentliche_container order by nummer;

\echo '=== 14. Entkoppeln ==='
select public.sensor_entkoppeln((select id from public.sensor where geraete_id='ALT-9001'), 'Test');
select status, container_id is null as entkoppelt from public.sensor where geraete_id='ALT-9001';
select count(*) as geschlossene_kopplungen from public.sensor_kopplung where getrennt_am is not null;

-- ---------------------------------------------------------------------------
-- Ab hier: die Aenderungen aus 0009_geraetevielfalt.sql
-- ---------------------------------------------------------------------------

\echo '=== 15. Messbereich haengt am Geraet, nicht an einer festen Grenze ==='
insert into public.container (nummer, bezeichnung, ort, lat, lng, aufstelldatum)
values ('T-900', 'Zweiter Testplatz', 'Grossheubach', 49.7400, 9.2200, current_date - 10);

-- Ein Geraet mit kleinerem Messbereich, wie ihn ein gekauftes haette
insert into public.sensor (geraete_id, montage_offset_mm, mess_max_mm)
values ('ALT-9002', 200, 4500);
insert into public.anlerncode (sensor_id, code)
select id, 'ZWEI-9002' from public.sensor where geraete_id='ALT-9002';

-- 4000 mm liegt im Bereich, 5000 mm nicht. Unter der frueheren festen Grenze
-- von 6000 mm waeren beide durchgegangen.
insert into public.messung (sensor_id, gemessen_am, abstand_mm)
select id, now() - interval '5 hours', 4000 from public.sensor where geraete_id='ALT-9002';
insert into public.messung (sensor_id, gemessen_am, abstand_mm)
select id, now() - interval '4 hours', 5000 from public.sensor where geraete_id='ALT-9002';

select m.abstand_mm, m.gueltig, m.container_id is null as noch_ohne_container
from public.messung m join public.sensor s on s.id = m.sensor_id
where s.geraete_id='ALT-9002' order by m.gemessen_am;

\echo '=== 16. Geprueft wird auch, solange der Sensor an keinem Container haengt ==='
-- Diese Messungen ordnet sensor_koppeln beim Anlernen nachtraeglich zu, und
-- container_kalibrieren zieht sie fuer den Leerwert heran. Gingen sie
-- ungeprueft als gueltig durch, koennte ein Ausreisser aus der Werkstatt die
-- Kalibrierung verderben.
do $$
declare v_ungueltig integer;
begin
  select count(*) into v_ungueltig
    from public.messung m join public.sensor s on s.id = m.sensor_id
   where s.geraete_id='ALT-9002' and not m.gueltig;

  if v_ungueltig <> 1 then
    raise exception 'FEHLER: erwartet genau eine ungueltige Messung, gezaehlt %', v_ungueltig;
  end if;
  raise notice 'korrekt: ausserhalb des Messbereichs ist ungueltig, auch ohne Kopplung';
end $$;

\echo '=== 17. Kalibrieren gelingt ohne frische Taster-Messung ==='
-- Die einzige gueltige Messung ist fuenf Stunden alt. Mit dem frueheren festen
-- Fenster von einer Stunde kam hier "Bitte Taster am Sensor druecken" - ein
-- gekauftes Geraet ohne Taster liesse sich so nie kalibrieren.
select public.sensor_koppeln('ZWEI-9002', (select id from public.container where nummer='T-900'),
                             49.7400, 9.2200, false, 'Zweite Testkopplung');
select public.container_kalibrieren((select id from public.container where nummer='T-900'));
select nummer, leer_abstand_mm, voll_abstand_mm from public.container where nummer='T-900';

\echo '=== 18. Nachrechnen beruecksichtigt den Montageversatz ==='
-- In messung.abstand_mm steht der rohe Messwert, bezogen auf die
-- Sensorunterkante. Erst der Montageversatz macht daraus einen Wert ab
-- Deckelinnenseite. Beim Einfuegen wurde er immer mitgerechnet, beim
-- Nachrechnen bis 0008 nicht - eine Nachkalibrierung verschob damit saemtliche
-- historischen Werte um genau diesen Versatz.
insert into public.messung (sensor_id, gemessen_am, abstand_mm)
select id, now() - interval '10 minutes', 2000 from public.sensor where geraete_id='ALT-9002';

do $$
declare
  v_beim_einfuegen smallint;
  v_nach_rechnung  smallint;
  v_container      uuid := (select id from public.container where nummer='T-900');
begin
  select m.fuellstand_prozent into v_beim_einfuegen
    from public.messung m join public.sensor s on s.id = m.sensor_id
   where s.geraete_id='ALT-9002' and m.abstand_mm = 2000;

  -- Erneut mit demselben Leerwert kalibrieren: der Prozentwert darf sich
  -- dadurch nicht veraendern.
  perform public.container_kalibrieren(v_container, 4000, 600);

  select m.fuellstand_prozent into v_nach_rechnung
    from public.messung m join public.sensor s on s.id = m.sensor_id
   where s.geraete_id='ALT-9002' and m.abstand_mm = 2000;

  if v_beim_einfuegen is distinct from v_nach_rechnung then
    raise exception 'FEHLER: Fuellstand durch das Nachrechnen von % auf % verschoben',
      v_beim_einfuegen, v_nach_rechnung;
  end if;
  raise notice 'korrekt: Nachrechnen laesst den Fuellstand bei % Prozent stehen', v_nach_rechnung;
end $$;

\echo '=== 19. ICCID ist eindeutig ==='
update public.sensor set iccid = '8988000000000000001' where geraete_id='ALT-9002';
do $$
begin
  update public.sensor set iccid = '8988000000000000001' where geraete_id='ALT-9001';
  raise exception 'FEHLER: doppelte ICCID wurde angenommen';
exception when unique_violation then
  raise notice 'korrekt abgelehnt: ICCID ist bereits vergeben';
end $$;
