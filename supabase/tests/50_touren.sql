\set ON_ERROR_STOP on
\pset pager off

-- ===========================================================================
-- Tagestouren, Fahrerablauf, Entsorger und Benutzeranlage
-- (0014_entsorger.sql bis 0017_benutzername_ohne_email.sql)
--
-- Geprueft wird das, worauf sich der Fahrerablauf verlaesst:
--
--   1. Aus einer Regeltour entsteht eine Tour mit deren Standorten
--   2. Mehrere Touren am selben Tag sind erlaubt
--   3. Tour starten ist wiederholbar (Funkloch)
--   4. Ein Stopp abschliessen erzeugt genau eine Leerung je Container
--   5. WIEDERHOLBARKEIT: derselbe Aufruf nochmal erzeugt keine zweite Leerung
--   6. Nicht geleert samt Grund wird zur Meldung an die Disposition
--   7. Ein fremder Fahrer kommt nicht an die Tour
--   8. Nach dem Abschluss nimmt die Tour nichts mehr an
--   9. Entsorger: hinterlegt -> anrufen, nicht hinterlegt -> mitnehmen
--  10. Ein Container ohne eigene Koordinaten bleibt oeffentlich sichtbar
--  11. Ein Benutzer ohne E-Mail laesst sich anlegen (0017)
--  12. Keine oeffentliche Ansicht ruft eine fuer anon gesperrte Funktion (0018)
--
-- Punkt 5 traegt die Offlinefaehigkeit der Fahreransicht. Sendet sie eine
-- Bestaetigung nach, von der sie nicht weiss, ob der erste Versuch ankam,
-- darf daraus keine doppelte Leerung werden - sonst zaehlt die Auswertung
-- Fahrten, die es nie gab.
-- ===========================================================================

grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'dispo3@brk-mill.de', '{"name":"Dispo Drei"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'fahrer1@brk-mill.de', '{"name":"Fahrer Eins"}'::jsonb),
  ('77777777-7777-7777-7777-777777777777', 'fahrer2@brk-mill.de', '{"name":"Fahrer Zwei"}'::jsonb)
on conflict do nothing;

update public.benutzerprofil set rolle = 'dispo'  where id = '55555555-5555-5555-5555-555555555555';
update public.benutzerprofil set rolle = 'fahrer' where id = '66666666-6666-6666-6666-666666666666';
update public.benutzerprofil set rolle = 'fahrer' where id = '77777777-7777-7777-7777-777777777777';

set test.uid = '55555555-5555-5555-5555-555555555555';

-- Zwei Standorte mit je zwei Containern, sauber kalibriert wie in 40_standorte.
insert into public.standort (name, ort, lat, lng) values
  ('Tourplatz A', 'Miltenberg',   49.7040, 9.2530),
  ('Tourplatz B', 'Grossheubach', 49.7300, 9.2200);

insert into public.container (nummer, bezeichnung, standort_id)
select 'T-A' || i, 'Tour A ' || i,
       (select id from public.standort where name = 'Tourplatz A')
from generate_series(1, 2) i;

insert into public.container (nummer, bezeichnung, standort_id)
select 'T-B' || i, 'Tour B ' || i,
       (select id from public.standort where name = 'Tourplatz B')
from generate_series(1, 2) i;

-- ---------------------------------------------------------------------------
\echo '=== 1. Aus einer Regeltour entsteht eine Tour mit deren Standorten ==='
-- ---------------------------------------------------------------------------
insert into public.route (name, wochentag, intervall_wochen, anker_datum)
values ('Pruefroute Sued', extract(isodow from current_date)::smallint, 1, current_date);

insert into public.route_standort (route_id, standort_id, position)
select (select id from public.route where name = 'Pruefroute Sued'), id,
       (row_number() over (order by name))::smallint
from public.standort where name in ('Tourplatz A', 'Tourplatz B');

do $$
declare
  v_route uuid; v_tour uuid; v_stopps integer; v_name text; v_status public.tourstatus;
begin
  select id into v_route from public.route where name = 'Pruefroute Sued';

  v_tour := public.tour_aus_route(v_route, current_date,
                                  '66666666-6666-6666-6666-666666666666');

  select count(*) into v_stopps from public.tour_stopp where tour_id = v_tour;
  select name, status into v_name, v_status from public.tour where id = v_tour;

  if v_stopps <> 2 then
    raise exception 'Erwartet 2 Stopps aus der Regeltour, bekommen %', v_stopps;
  end if;
  if v_name <> 'Pruefroute Sued' then
    raise exception 'Die Tour sollte den Namen der Regeltour tragen, hat aber %', v_name;
  end if;
  if v_status <> 'geplant' then
    raise exception 'Eine neue Tour ist geplant, nicht %', v_status;
  end if;

  raise notice 'OK: Tour aus Regeltour mit % Stopps, Zustand %', v_stopps, v_status;
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 2. Mehrere Touren am selben Tag, verschiedene Fahrer ==='
-- ---------------------------------------------------------------------------
do $$
declare v_route uuid; v_zweite uuid; v_anzahl integer;
begin
  select id into v_route from public.route where name = 'Pruefroute Sued';
  v_zweite := public.tour_aus_route(v_route, current_date,
                                    '77777777-7777-7777-7777-777777777777');

  select count(*) into v_anzahl from public.tour
   where datum = current_date and route_id = v_route;

  if v_anzahl < 2 then
    raise exception 'Zwei Touren am selben Tag muessen moeglich sein, gezaehlt %', v_anzahl;
  end if;

  -- Die zweite Tour wird hier nicht weiter gebraucht.
  delete from public.tour where id = v_zweite;
  raise notice 'OK: mehrere Touren je Tag moeglich';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 3. Tour starten ist wiederholbar ==='
-- ---------------------------------------------------------------------------
set test.uid = '66666666-6666-6666-6666-666666666666';

do $$
declare v_tour uuid; v_status public.tourstatus; v_beginn timestamptz; v_beginn2 timestamptz;
begin
  select id into v_tour from public.tour
   where route_id = (select id from public.route where name = 'Pruefroute Sued')
   order by angelegt_am limit 1;

  perform public.tour_starten(v_tour);
  select status, begonnen_am into v_status, v_beginn from public.tour where id = v_tour;

  if v_status <> 'laeuft' then
    raise exception 'Nach dem Start muss die Tour laufen, ist aber %', v_status;
  end if;

  -- Zweiter Druck auf den Knopf nach Funkloch
  perform public.tour_starten(v_tour);
  select begonnen_am into v_beginn2 from public.tour where id = v_tour;

  if v_beginn2 <> v_beginn then
    raise exception 'Der zweite Start hat den Beginn verschoben: % -> %', v_beginn, v_beginn2;
  end if;

  raise notice 'OK: Start wiederholbar, Beginn bleibt stehen';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 4./5. Stopp abschliessen erzeugt eine Leerung - auch bei Wiederholung ==='
-- ---------------------------------------------------------------------------
do $$
declare
  v_tour uuid; v_stopp uuid; v_standort uuid;
  v_c1 uuid; v_c2 uuid;
  v_leerungen integer; v_zeilen integer; v_status public.stoppstatus;
  v_liste jsonb;
begin
  select id into v_tour from public.tour
   where route_id = (select id from public.route where name = 'Pruefroute Sued')
   order by angelegt_am limit 1;

  select id, standort_id into v_stopp, v_standort
    from public.tour_stopp where tour_id = v_tour order by position limit 1;

  select id into v_c1 from public.container where standort_id = v_standort order by nummer limit 1;
  select id into v_c2 from public.container where standort_id = v_standort order by nummer desc limit 1;

  v_liste := jsonb_build_array(
    jsonb_build_object('container_id', v_c1, 'geleert', true),
    jsonb_build_object('container_id', v_c2, 'geleert', true)
  );

  perform public.tour_stopp_abschliessen(v_stopp, v_liste);

  select count(*) into v_leerungen from public.leerung where container_id in (v_c1, v_c2);
  select count(*) into v_zeilen    from public.tour_container where stopp_id = v_stopp;
  select status into v_status      from public.tour_stopp where id = v_stopp;

  if v_leerungen <> 2 then
    raise exception 'Erwartet 2 Leerungen, bekommen %', v_leerungen;
  end if;
  if v_status <> 'erledigt' then
    raise exception 'Der Stopp muss erledigt sein, ist aber %', v_status;
  end if;

  -- Nachsenden: zweimal dasselbe
  perform public.tour_stopp_abschliessen(v_stopp, v_liste);
  perform public.tour_stopp_abschliessen(v_stopp, v_liste);

  select count(*) into v_leerungen from public.leerung where container_id in (v_c1, v_c2);
  select count(*) into v_zeilen    from public.tour_container where stopp_id = v_stopp;

  if v_leerungen <> 2 then
    raise exception 'Nachsenden hat zusaetzliche Leerungen erzeugt: % statt 2', v_leerungen;
  end if;
  if v_zeilen <> 2 then
    raise exception 'Nachsenden hat zusaetzliche Tourzeilen erzeugt: % statt 2', v_zeilen;
  end if;

  raise notice 'OK: 2 Leerungen, dreimal gesendet, keine Dublette';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 6. Nicht geleert samt Grund wird zur Meldung ==='
-- ---------------------------------------------------------------------------
do $$
declare
  v_tour uuid; v_stopp uuid; v_standort uuid; v_c uuid;
  v_meldungen integer; v_geleert boolean;
begin
  select id into v_tour from public.tour
   where route_id = (select id from public.route where name = 'Pruefroute Sued')
   order by angelegt_am limit 1;

  select id, standort_id into v_stopp, v_standort
    from public.tour_stopp where tour_id = v_tour and status = 'offen' order by position limit 1;

  select id into v_c from public.container where standort_id = v_standort order by nummer limit 1;

  perform public.tour_stopp_abschliessen(
    v_stopp,
    jsonb_build_array(jsonb_build_object(
      'container_id', v_c, 'geleert', false,
      'grund', 'Fremdmuell im Container, Bauhof verstaendigt')),
    'Bauhof angerufen');

  select count(*) into v_meldungen from public.meldung
   where container_id = v_c and erledigt_am is null
     and text like 'Fremdmuell%';
  select geleert into v_geleert from public.tour_container
   where stopp_id = v_stopp and container_id = v_c;

  if v_meldungen <> 1 then
    raise exception 'Erwartet genau 1 offene Meldung, bekommen %', v_meldungen;
  end if;
  if v_geleert then
    raise exception 'Der Container wurde als geleert vermerkt, obwohl er stehen blieb';
  end if;

  -- Keine Leerung, obwohl der Stopp abgeschlossen ist
  if exists (select 1 from public.tour_container
              where stopp_id = v_stopp and container_id = v_c and leerung_id is not null) then
    raise exception 'Fuer einen nicht geleerten Container darf keine Leerung entstehen';
  end if;

  raise notice 'OK: nicht geleert -> Meldung an die Disposition, keine Leerung';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 7. Ein fremder Fahrer kommt nicht an die Tour ==='
-- ---------------------------------------------------------------------------
set test.uid = '77777777-7777-7777-7777-777777777777';

do $$
declare v_tour uuid; v_stopp uuid; v_fehler text;
begin
  select id into v_tour from public.tour
   where route_id = (select id from public.route where name = 'Pruefroute Sued')
   order by angelegt_am limit 1;
  select id into v_stopp from public.tour_stopp where tour_id = v_tour limit 1;

  begin
    perform public.tour_stopp_abschliessen(v_stopp, '[]'::jsonb);
    raise exception 'Der fremde Fahrer durfte den Stopp abschliessen - Luecke im Zugriffsschutz';
  exception when others then
    v_fehler := sqlerrm;
    if v_fehler like '%Luecke im Zugriffsschutz%' then raise; end if;
  end;

  begin
    perform public.tour_starten(v_tour);
    raise exception 'Der fremde Fahrer durfte die Tour starten - Luecke im Zugriffsschutz';
  exception when others then
    v_fehler := sqlerrm;
    if v_fehler like '%Luecke im Zugriffsschutz%' then raise; end if;
  end;

  raise notice 'OK: fremder Fahrer abgewiesen';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 8. Nach dem Abschluss nimmt die Tour nichts mehr an ==='
-- ---------------------------------------------------------------------------
set test.uid = '66666666-6666-6666-6666-666666666666';

do $$
declare v_tour uuid; v_stopp uuid; v_antwort jsonb; v_status public.tourstatus;
begin
  select id into v_tour from public.tour
   where route_id = (select id from public.route where name = 'Pruefroute Sued')
   order by angelegt_am limit 1;

  perform public.tour_abschliessen(v_tour);
  select status into v_status from public.tour where id = v_tour;

  if v_status <> 'abgeschlossen' then
    raise exception 'Die Tour muss abgeschlossen sein, ist aber %', v_status;
  end if;

  -- Ein spaet nachgesendeter Stopp darf nichts mehr verschieben
  select id into v_stopp from public.tour_stopp where tour_id = v_tour limit 1;
  v_antwort := public.tour_stopp_abschliessen(v_stopp, '[]'::jsonb);

  if (v_antwort ->> 'ok')::boolean then
    raise exception 'Eine abgeschlossene Tour hat noch eine Buchung angenommen: %', v_antwort;
  end if;

  -- Doppelter Abschluss ist unschaedlich
  perform public.tour_abschliessen(v_tour);

  raise notice 'OK: abgeschlossene Tour ist dicht, Abschluss wiederholbar';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 9. Entsorger: hinterlegt heisst anrufen, sonst mitnehmen ==='
-- ---------------------------------------------------------------------------
set test.uid = '55555555-5555-5555-5555-555555555555';

insert into public.entsorger (name, gemeinde, telefon)
values ('Bauhof Grossheubach', 'Grossheubach', '09371 12345');

update public.standort
   set entsorger_id = (select id from public.entsorger where name = 'Bauhof Grossheubach')
 where name = 'Tourplatz B';

do $$
declare v_mit boolean; v_ohne boolean; v_telefon text;
begin
  select abholung_vereinbart, telefon into v_mit, v_telefon
    from public.standort_entsorgung
   where standort_name = 'Tourplatz B';

  select abholung_vereinbart into v_ohne
    from public.standort_entsorgung
   where standort_name = 'Tourplatz A';

  if not v_mit then
    raise exception 'Mit hinterlegtem Bauhof muss eine Abholung vereinbart sein';
  end if;
  if v_telefon is null then
    raise exception 'Die Rufnummer des Bauhofs muss beim Standort ankommen';
  end if;
  if v_ohne then
    raise exception 'Ohne Entsorger darf keine Abholung vorgetaeuscht werden';
  end if;

  raise notice 'OK: % mit Bauhof, Tourplatz A ohne -> Muell mitnehmen', v_telefon;
end $$;

-- Ein Entsorger ohne jede Kontaktmoeglichkeit ist sinnlos und wird abgewiesen.
do $$
begin
  begin
    insert into public.entsorger (name, gemeinde) values ('Bauhof ohne alles', 'Nirgendwo');
    raise exception 'Ein Entsorger ohne Telefon und E-Mail wurde angenommen';
  exception when check_violation then
    raise notice 'OK: Entsorger ohne Kontaktmoeglichkeit abgewiesen';
  end;
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 10. Ohne Koordinaten am Platz faellt alles heraus, was dort steht ==='
-- Frueher pruefte dieser Abschnitt den Rueckfall von der Container- auf die
-- Standortkoordinate. Seit 0022 gibt es nur noch die eine Koordinate - und
-- damit ist die wichtigere Frage, ob ihr Fehlen sichtbar wird. Es faellt der
-- ganze Platz heraus, samt seiner Behaelter; genau davor warnt die
-- Standortseite im internen Bereich.
-- ---------------------------------------------------------------------------
do $$
declare v_s uuid; v_vorher integer; v_nachher integer;
begin
  select id into v_s from public.standort where name = 'Tourplatz A';

  select count(*) into v_vorher from public.oeffentliche_standorte where standort_id = v_s;
  if v_vorher <> 1 then
    raise exception 'Tourplatz A war schon vorher nicht oeffentlich sichtbar (%)', v_vorher;
  end if;

  update public.standort set lat = null, lng = null where id = v_s;
  select count(*) into v_nachher from public.oeffentliche_standorte where standort_id = v_s;
  if v_nachher <> 0 then
    raise exception 'Platz ohne Koordinaten ist weiterhin oeffentlich sichtbar';
  end if;

  -- Zustand wiederherstellen, damit die folgenden Abschnitte darauf bauen.
  update public.standort set lat = 49.7040, lng = 9.2530 where id = v_s;
  raise notice 'OK: ohne Koordinaten kein oeffentlicher Eintrag';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 11. Benutzer ohne E-Mail laesst sich anlegen ==='
--
-- neuen_benutzer_anlegen() setzte den Namen aus Metadaten ODER E-Mail. Fehlten
-- beide, wurde er NULL - und weil benutzerprofil.name NOT NULL ist, scheiterte
-- die ganze Benutzeranlage. Der Ausloeser haengt AFTER INSERT an auth.users,
-- also mit einem Datenbankfehler, dem man die Ursache nicht ansieht.
-- ---------------------------------------------------------------------------
do $$
declare v_name text; v_name2 text;
begin
  insert into auth.users (id) values ('88888888-0000-0000-0000-000000000001');
  select name into v_name from public.benutzerprofil
   where id = '88888888-0000-0000-0000-000000000001';

  if v_name is null then
    raise exception 'Der Name darf nicht NULL sein';
  end if;
  if v_name <> '' then
    raise exception 'Ohne Angabe wird ein leerer Name erwartet, bekommen: %', v_name;
  end if;

  -- Mit E-Mail bleibt es beim bisherigen Verhalten: der Teil vor dem @.
  insert into auth.users (id, email)
  values ('88888888-0000-0000-0000-000000000002', 'hans.meier@brk-mill.de');
  select name into v_name2 from public.benutzerprofil
   where id = '88888888-0000-0000-0000-000000000002';

  if v_name2 <> 'hans.meier' then
    raise exception 'Aus der E-Mail sollte hans.meier werden, bekommen: %', v_name2;
  end if;

  raise notice 'OK: ohne E-Mail leerer Name statt Fehler, mit E-Mail unveraendert';
end $$;

-- ---------------------------------------------------------------------------
\echo '=== 12. Oeffentliche Ansichten rufen keine gesperrten Funktionen ==='
--
-- Der Fehler, der das hier ausgeloest hat: oeffentliche_standorte rief intern
-- einstellung_zahl() auf. Migration 0005 hatte die Ausfuehrungsrechte dieser
-- Funktion fuer anon entzogen.
--
-- Bei einer Ansicht mit security_invoker = false werden TABELLENrechte gegen
-- den Eigentuemer geprueft, AUSFUEHRUNGSrechte von Funktionen aber gegen die
-- aufrufende Rolle. Fuer anon scheiterte die Abfrage mit 42501, und die Seite
-- hinter dem QR-Code blieb leer.
--
-- Besonders tueckisch: "select count(*)" und "select standort_id" gingen
-- durch, weil Postgres die Spalte mit dem Funktionsaufruf aus dem Plan
-- streichen kann. Nur "select *" faellt herein. Ein Test, der zaehlt statt
-- zu lesen, haette den Fehler nicht gefunden - dieser hier prueft deshalb
-- die Definition der Ansicht, nicht ihr Ergebnis.
-- ---------------------------------------------------------------------------
-- Die uebrigen Testdateien vergeben anon pauschal Rechte. Fuer diese Pruefung
-- wird der Produktionszustand wiederhergestellt: einstellung_zahl ist fuer
-- anon gesperrt (Migration 0005).
revoke execute on function public.einstellung_zahl(text, numeric) from anon;

-- Geprueft wird die benannte Liste der Ansichten, die ohne Anmeldung
-- erreichbar sind - nicht, was anon gerade an Rechten hat: die uebrigen
-- Testdateien vergeben grosszuegig Rechte, um Zugriffsregeln statt Rechte zu
-- pruefen, und damit waere ein Filter ueber has_table_privilege wertlos.
-- Diese beiden Ansichten sind der oeffentliche Vertrag (0022).
do $$
declare
  v_ansicht  text;
  v_funktion text;
  v_treffer  text := '';
begin
  foreach v_ansicht in array array['oeffentliche_standorte', 'oeffentlicher_container']
  loop
    for v_funktion in
      select p.proname
        from pg_proc p
        join pg_namespace pn on pn.oid = p.pronamespace
       where pn.nspname = 'public'
         and not has_function_privilege('anon', p.oid, 'execute')
         and pg_get_viewdef(('public.' || quote_ident(v_ansicht))::regclass, true)
             like '%' || p.proname || '(%'
    loop
      v_treffer := v_treffer || format('%s ruft %s(); ', v_ansicht, v_funktion);
    end loop;
  end loop;

  if v_treffer <> '' then
    raise exception 'Oeffentliche Ansicht ruft eine fuer anon gesperrte Funktion: %', v_treffer;
  end if;

  raise notice 'OK: keine oeffentliche Ansicht haengt an einer gesperrten Funktion';
end $$;

-- Und die Gegenprobe am lebenden Objekt: alle Spalten lesen, nicht zaehlen.
do $$
declare v_zeilen integer; v_mit_wert integer;
begin
  select count(*), count(freie_prozent)
    into v_zeilen, v_mit_wert
    from (select * from public.oeffentliche_standorte order by name) t;

  if v_zeilen = 0 then
    raise exception 'oeffentliche_standorte liefert keine Zeile';
  end if;
  if v_mit_wert = 0 then
    raise exception 'freie_prozent bleibt leer - die Volumenrechnung greift nicht';
  end if;

  raise notice 'OK: % Plaetze, davon % mit gerechneter Restkapazitaet', v_zeilen, v_mit_wert;
end $$;

\echo '=== Alle Pruefungen bestanden ==='
