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
exception when insufficient_privilege then
  raise notice 'korrekt abgelehnt (RLS): %', sqlerrm;
end $$;

\echo '-- Funktionsrechte: darf keine Verwaltungsfunktion ohne Recht aufrufen:'
do $$ declare n int; begin
  select count(*) into n from public.pruefe_stille_sensoren();
  raise exception 'FEHLER: pruefe_stille_sensoren war aufrufbar';
exception when insufficient_privilege then
  raise notice 'korrekt abgelehnt: %', sqlerrm;
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
select count(*) as oeffentlich_sichtbar from public.oeffentliche_standorte;
do $$ declare n int; begin
  select count(*) into n from public.container;
  if n > 0 then raise exception 'FEHLER: anon sieht % Container in der Rohtabelle', n; end if;
  raise notice 'korrekt: Rohtabelle fuer anon leer';
end $$;
do $$ declare n int; begin
  select count(*) into n from public.tourenplanung();
  raise exception 'FEHLER: anon konnte die Tourenplanung abrufen (% Zeilen)', n;
exception when insufficient_privilege then
  raise notice 'korrekt abgelehnt: Tourenplanung ohne Anmeldung nicht aufrufbar';
end $$;
do $$ declare n int; begin
  select count(*) into n from public.standort_planung;
  if n > 0 then raise exception 'FEHLER: anon sieht % Zeilen der Planungsansicht', n; end if;
  raise notice 'korrekt: Planungsansicht fuer anon leer';
exception when insufficient_privilege then
  raise notice 'korrekt abgelehnt: Planungsansicht ohne Anmeldung nicht lesbar';
end $$;
reset role;

\echo '=== D. Administration ==='
set test.uid = '11111111-1111-1111-1111-111111111111';
set role authenticated;
-- Ein Behaelter braucht seit 0022 einen Platz; hier geht es um das Duerfen,
-- nicht um das Modell, deshalb einer aus dem Bestand.
insert into public.container (nummer, standort_id)
select 'T-003', id from public.standort order by name limit 1
on conflict (nummer) do nothing;
select 'ok' as container_angelegt;
select count(*) as sichtbare_profile from public.benutzerprofil;
-- ---------------------------------------------------------------------------
\echo '=== E. Welche Funktionen darf anon ueberhaupt aufrufen? ==='
-- In PostgreSQL erbt jede neue Funktion "execute to PUBLIC". 0005 und 0012
-- nehmen das einzeln zurueck - aber `drop`+`create` und jede geaenderte
-- Signatur legen ein NEUES Objekt an, das wieder offen ist. Genau so sind in
-- 0022 zwei Sperren verlorengegangen, ohne dass es jemandem auffiel.
--
-- Deshalb hier keine Aufzaehlung dessen, was gesperrt sein soll, sondern die
-- Gegenrichtung: alles ausser dieser Liste ist ein Fehler. Wer eine Funktion
-- bewusst oeffnet, traegt sie hier ein - und muss dabei begruenden, warum.
-- ---------------------------------------------------------------------------
do $$
declare
  v_erlaubt text[] := array[
    'fuellstand_stufe',      -- die oeffentlichen Ansichten rechnen damit (0003)
    'meldung_oeffentlich'    -- der Knopf "Container ist voll" hinter dem QR-Code
  ];
  v_offen text := '';
  r record;
begin
  for r in
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'execute')
       and not (p.proname = any(v_erlaubt))
       -- Erweiterungen bringen ihre eigenen Funktionen mit (pgcrypto legt sie
       -- in public ab). Die gehoeren nicht uns und stehen nicht zur Debatte.
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e'
       )
     order by p.proname
  loop
    v_offen := v_offen || r.proname || ' ';
  end loop;

  if v_offen <> '' then
    raise exception 'FEHLER: anon darf Funktionen aufrufen, die nicht freigegeben sind: %', v_offen;
  end if;
  raise notice 'korrekt: anon darf nur %', array_to_string(v_erlaubt, ', ');
end $$;

reset role;
