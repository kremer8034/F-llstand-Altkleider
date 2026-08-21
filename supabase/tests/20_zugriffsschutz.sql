\pset pager off
\echo '=== A. Fahrpersonal ==='
set test.uid = '22222222-2222-2222-2222-222222222222';
set role authenticated;
select public.aktuelle_rolle() as rolle;
select count(*) as sichtbare_container from public.container;

\echo '-- darf Leerung erfassen:'
insert into public.leerung (container_id, art) values ((select id from public.container where nummer='T-001'), 'manuell');
select 'ok' as leerung_erfasst;

\echo '-- darf KEINEN Container anlegen:'
do $$ begin
  insert into public.container (nummer) values ('VERBOTEN');
  raise exception 'FEHLER: Einfuegen war erlaubt';
exception when insufficient_privilege then raise notice 'korrekt abgelehnt (RLS)';
end $$;

\echo '-- darf NICHT an die Geraeteschluessel:'
do $$ declare n int; begin
  select count(*) into n from public.sensor_geheimnis;
  if n > 0 then raise exception 'FEHLER: % Geheimnisse lesbar', n; end if;
  raise notice 'korrekt: keine Zeile sichtbar';
end $$;

\echo '-- darf sich nicht selbst zum Administrator machen:'
do $$ begin
  update public.benutzerprofil set rolle='admin' where id = auth.uid();
  if (select rolle from public.benutzerprofil where id = auth.uid()) = 'admin' then
    raise exception 'FEHLER: Rollenwechsel war moeglich';
  end if;
  raise notice 'korrekt: Rolle unveraendert (%)', (select rolle from public.benutzerprofil where id = auth.uid());
end $$;

reset role;

\echo '=== B. Unbekanntes Konto sieht nichts ==='
set test.uid = '99999999-9999-9999-9999-999999999999';
set role authenticated;
select count(*) as container, (select count(*) from public.messung) as messungen from public.container;
reset role;

\echo '=== C. Ohne Anmeldung ==='
set test.uid = '';
set role anon;
select count(*) as oeffentlich_sichtbar from public.oeffentliche_container;
do $$ declare n int; begin
  select count(*) into n from public.container;
  if n > 0 then raise exception 'FEHLER: anon sieht % Container in der Rohtabelle', n; end if;
  raise notice 'korrekt: Rohtabelle fuer anon leer';
end $$;
reset role;

\echo '=== D. Administration ==='
set test.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;
insert into public.container (nummer, ort) values ('T-003', 'Miltenberg');
select 'ok' as container_angelegt;
select count(*) as sichtbare_profile from public.benutzerprofil;
reset role;
