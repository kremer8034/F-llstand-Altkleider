\set ON_ERROR_STOP on
\pset pager off

-- ===========================================================================
-- Bereitschaften und die Trennung, die sie tragen (0019_gruppen.sql)
--
-- Geprueft wird genau das, worauf sich die Trennung verlaesst - und zwar mit
-- gesetzter Rolle `authenticated`, denn nur dann greifen die Zugriffsregeln.
-- Als Eigentuemer der Tabellen laufen sie ins Leere, und ein Test, der ohne
-- Rollenwechsel "bestanden" meldet, prueft nichts.
--
--   1. Ohne jede Zuordnung aendert sich nichts: das Konto sieht alles
--   2. Zugeordnet: nur die eigene Bereitschaft ist sichtbar
--   3. Was keiner Bereitschaft gehoert, bleibt fuer alle sichtbar
--   4. Eine fremde Tour laesst sich nicht aendern
--   5. Ein fremder Standort laesst sich nicht auf die eigene Tour setzen
--   6. Die Administration sieht weiterhin alles
--   7. Der zugewiesene Fahrer sieht seine Tour auch ueber Gruppengrenzen
--   8. Eine Tour aus einer Regeltour erbt deren Bereitschaft
--   9. Wird eine Bereitschaft geloescht, bleiben ihre Standorte bestehen
--
-- Punkt 1 und 3 sind die beiden Regeln, ohne die das Einschalten im Betrieb
-- alles umwerfen wuerde: ein Haus, das die Bereitschaften einfuehrt, darf am
-- selben Tag nicht die Haelfte seiner Plaetze aus der Ansicht verlieren.
-- ===========================================================================

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

-- Bei Supabase hat `authenticated` dieses Recht ab Werk; im Nachbau muss es
-- gesetzt werden, sonst laeuft jeder Aufruf von auth.uid() unter dieser Rolle
-- ins Leere - und hier wird ausdruecklich MIT gesetzter Rolle geprueft.
grant usage on schema auth to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'dispo.nord@brk-mill.de', '{"name":"Dispo Nord"}'::jsonb),
  ('99999999-9999-9999-9999-999999999999', 'dispo.sued@brk-mill.de', '{"name":"Dispo Sued"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin.g@brk-mill.de',    '{"name":"Admin G"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'fahrer.g@brk-mill.de',   '{"name":"Fahrer G"}'::jsonb)
on conflict do nothing;

update public.benutzerprofil set rolle = 'dispo'  where id = '88888888-8888-8888-8888-888888888888';
update public.benutzerprofil set rolle = 'dispo'  where id = '99999999-9999-9999-9999-999999999999';
update public.benutzerprofil set rolle = 'admin'  where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.benutzerprofil set rolle = 'fahrer' where id = 'aaaaaaaa-0000-0000-0000-000000000002';

-- Zwei Bereitschaften, je ein Standort, dazu einer ohne Zuordnung.
insert into public.gruppe (id, name, ansprechpartner, telefon) values
  ('11111111-aaaa-0000-0000-000000000001', 'Bereitschaft Nord', 'N. Norden', '09371 111'),
  ('11111111-aaaa-0000-0000-000000000002', 'Bereitschaft Sued', 'S. Sueden', '09371 222');

insert into public.standort (id, name, ort, lat, lng, gruppe_id) values
  ('22222222-aaaa-0000-0000-000000000001', 'Platz Nord',    'Nordheim', 49.75, 9.25,
   '11111111-aaaa-0000-0000-000000000001'),
  ('22222222-aaaa-0000-0000-000000000002', 'Platz Sued',    'Suedheim', 49.65, 9.25,
   '11111111-aaaa-0000-0000-000000000002'),
  ('22222222-aaaa-0000-0000-000000000003', 'Platz Gemeinsam', 'Mitte',  49.70, 9.25, null);

-- Je eine Tour, in der Rolle des Eigentuemers angelegt (die Regeln kommen
-- gleich, hier geht es erst einmal um den Ausgangsbestand).
insert into public.tour (id, name, datum, gruppe_id) values
  ('33333333-aaaa-0000-0000-000000000001', 'Tour Nord', current_date,
   '11111111-aaaa-0000-0000-000000000001'),
  ('33333333-aaaa-0000-0000-000000000002', 'Tour Sued', current_date,
   '11111111-aaaa-0000-0000-000000000002'),
  ('33333333-aaaa-0000-0000-000000000003', 'Tour Gemeinsam', current_date, null);

-- ---------------------------------------------------------------------------
\echo '=== 1. Ohne Zuordnung sieht das Konto alles (Ausgangslage) ==='
-- ---------------------------------------------------------------------------
set test.uid = '88888888-8888-8888-8888-888888888888';
set role authenticated;

do $$
declare v_st int; v_to int;
begin
  select count(*) into v_st from public.standort
   where id in ('22222222-aaaa-0000-0000-000000000001',
                '22222222-aaaa-0000-0000-000000000002',
                '22222222-aaaa-0000-0000-000000000003');
  select count(*) into v_to from public.tour
   where id in ('33333333-aaaa-0000-0000-000000000001',
                '33333333-aaaa-0000-0000-000000000002',
                '33333333-aaaa-0000-0000-000000000003');

  if v_st <> 3 or v_to <> 3 then
    raise exception 'Ohne Zuordnung muessen 3 Standorte und 3 Touren sichtbar sein, es sind % und %',
      v_st, v_to;
  end if;
  raise notice 'OK: ohne Zuordnung ist alles sichtbar (% Standorte, % Touren)', v_st, v_to;
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo '=== 2./3. Zugeordnet: eigene Bereitschaft und Herrenloses ==='
-- ---------------------------------------------------------------------------
insert into public.benutzer_gruppe (benutzer_id, gruppe_id) values
  ('88888888-8888-8888-8888-888888888888', '11111111-aaaa-0000-0000-000000000001'),
  ('99999999-9999-9999-9999-999999999999', '11111111-aaaa-0000-0000-000000000002');

set test.uid = '88888888-8888-8888-8888-888888888888';
set role authenticated;

do $$
declare v_nord int; v_sued int; v_gemeinsam int;
begin
  select count(*) into v_nord      from public.standort where id = '22222222-aaaa-0000-0000-000000000001';
  select count(*) into v_sued      from public.standort where id = '22222222-aaaa-0000-0000-000000000002';
  select count(*) into v_gemeinsam from public.standort where id = '22222222-aaaa-0000-0000-000000000003';

  if v_nord <> 1 then raise exception 'Der eigene Standort ist nicht sichtbar'; end if;
  if v_sued <> 0 then raise exception 'Der Standort der fremden Bereitschaft ist sichtbar - Luecke'; end if;
  if v_gemeinsam <> 1 then
    raise exception 'Ein Standort ohne Bereitschaft muss fuer alle sichtbar bleiben';
  end if;
  raise notice 'OK: eigener Standort sichtbar, fremder nicht, herrenloser fuer alle';
end $$;

do $$
declare v_nord int; v_sued int; v_gemeinsam int;
begin
  select count(*) into v_nord      from public.tour where id = '33333333-aaaa-0000-0000-000000000001';
  select count(*) into v_sued      from public.tour where id = '33333333-aaaa-0000-0000-000000000002';
  select count(*) into v_gemeinsam from public.tour where id = '33333333-aaaa-0000-0000-000000000003';

  if v_nord <> 1 or v_gemeinsam <> 1 or v_sued <> 0 then
    raise exception 'Tourensicht falsch: eigen=%, fremd=%, gemeinsam=%', v_nord, v_sued, v_gemeinsam;
  end if;
  raise notice 'OK: dieselbe Trennung gilt fuer Touren';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 4. Die fremde Tour laesst sich nicht aendern ==='
-- ---------------------------------------------------------------------------
do $$
declare v_name text;
begin
  update public.tour set name = 'GEKAPERT' where id = '33333333-aaaa-0000-0000-000000000002';

  -- Kein Fehler, sondern null Zeilen: die Regel blendet die Zeile aus, statt
  -- den Aufruf abzuweisen. Genau deshalb wertet die Anwendung die Zahl der
  -- geaenderten Zeilen aus (tourAendern in app/intern/touren/aktionen.ts).
  reset role;
  select name into v_name from public.tour where id = '33333333-aaaa-0000-0000-000000000002';
  set role authenticated;

  if v_name = 'GEKAPERT' then
    raise exception 'Die fremde Tour wurde geaendert - Luecke im Zugriffsschutz';
  end if;
  raise notice 'OK: fremde Tour unveraendert (%)', v_name;
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 5. Ein fremder Standort kommt nicht auf die eigene Tour ==='
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.tour_stopp (tour_id, standort_id, position)
  values ('33333333-aaaa-0000-0000-000000000001',
          '22222222-aaaa-0000-0000-000000000002', 1);
  raise exception 'Ein fremder Standort liess sich auf die eigene Tour setzen - Luecke';
exception when insufficient_privilege then
  raise notice 'korrekt abgelehnt (RLS): fremder Standort nicht aufnehmbar';
end $$;

do $$
begin
  insert into public.tour_stopp (tour_id, standort_id, position)
  values ('33333333-aaaa-0000-0000-000000000001',
          '22222222-aaaa-0000-0000-000000000003', 1);
  raise notice 'OK: der herrenlose Standort laesst sich aufnehmen';
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo '=== 6. Die Administration sieht weiterhin alles ==='
-- ---------------------------------------------------------------------------
-- Auch dann, wenn sie selbst einer Bereitschaft zugeordnet ist: sonst koennte
-- sie die Zuordnung nicht mehr pflegen, die sie gerade aussperrt.
insert into public.benutzer_gruppe (benutzer_id, gruppe_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-aaaa-0000-0000-000000000001');

set test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare v_st int;
begin
  select count(*) into v_st from public.standort
   where id in ('22222222-aaaa-0000-0000-000000000001',
                '22222222-aaaa-0000-0000-000000000002',
                '22222222-aaaa-0000-0000-000000000003');
  if v_st <> 3 then
    raise exception 'Die Administration sieht nur % von 3 Standorten', v_st;
  end if;
  raise notice 'OK: Administration sieht alles, trotz eigener Zuordnung';
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo '=== 7. Der zugewiesene Fahrer sieht seine Tour ueber Gruppengrenzen ==='
-- ---------------------------------------------------------------------------
update public.tour
   set fahrer_id = 'aaaaaaaa-0000-0000-0000-000000000002'
 where id = '33333333-aaaa-0000-0000-000000000002';   -- Tour Sued

insert into public.benutzer_gruppe (benutzer_id, gruppe_id) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001');  -- Fahrer in Nord

set test.uid = 'aaaaaaaa-0000-0000-0000-000000000002';
set role authenticated;

do $$
declare v_sichtbar int;
begin
  select count(*) into v_sichtbar from public.tour
   where id = '33333333-aaaa-0000-0000-000000000002';
  if v_sichtbar <> 1 then
    raise exception 'Der eingeteilte Fahrer sieht seine eigene Tour nicht - Aushilfe waere unmoeglich';
  end if;
  raise notice 'OK: eingeteilter Fahrer sieht seine Tour auch aus einer anderen Bereitschaft';
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo '=== 8. Eine Tour aus einer Regeltour erbt die Bereitschaft ==='
-- ---------------------------------------------------------------------------
insert into public.route (id, name, wochentag, intervall_wochen, anker_datum, gruppe_id)
values ('44444444-aaaa-0000-0000-000000000001', 'Regeltour Nord',
        extract(isodow from current_date)::smallint, 2, current_date,
        '11111111-aaaa-0000-0000-000000000001');

insert into public.route_standort (route_id, standort_id, position)
values ('44444444-aaaa-0000-0000-000000000001',
        '22222222-aaaa-0000-0000-000000000001', 1);

set test.uid = '88888888-8888-8888-8888-888888888888';
set role authenticated;

do $$
declare v_tour uuid; v_gruppe uuid;
begin
  v_tour := public.tour_aus_route('44444444-aaaa-0000-0000-000000000001', current_date + 1);
  select gruppe_id into v_gruppe from public.tour where id = v_tour;

  if v_gruppe is distinct from '11111111-aaaa-0000-0000-000000000001'::uuid then
    raise exception 'Die erzeugte Tour hat die Bereitschaft nicht geerbt (%)', v_gruppe;
  end if;
  raise notice 'OK: Tagestour erbt die Bereitschaft ihrer Regeltour';
end $$;

reset role;

-- ---------------------------------------------------------------------------
\echo '=== 9. Geloeschte Bereitschaft nimmt keine Standorte mit ==='
-- ---------------------------------------------------------------------------
do $$
declare v_da int; v_gruppe uuid;
begin
  delete from public.gruppe where id = '11111111-aaaa-0000-0000-000000000002';

  select count(*) into v_da from public.standort where id = '22222222-aaaa-0000-0000-000000000002';
  select gruppe_id into v_gruppe from public.standort where id = '22222222-aaaa-0000-0000-000000000002';

  if v_da <> 1 then
    raise exception 'Der Standort wurde mit der Bereitschaft geloescht - Datenverlust';
  end if;
  if v_gruppe is not null then
    raise exception 'Der Standort haengt noch an der geloeschten Bereitschaft';
  end if;
  raise notice 'OK: Standort bleibt und faellt in die gemeinsame Zustaendigkeit zurueck';
end $$;

\echo '=== Alle Pruefungen der Bereitschaften bestanden ==='
