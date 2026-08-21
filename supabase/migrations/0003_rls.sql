-- ============================================================================
-- 0003_rls.sql
-- Zugriffsschutz (Row Level Security) und die oeffentliche Kartenansicht.
--
-- Rollen:
--   admin  - alles, inklusive Benutzerverwaltung und Sensorstammdaten
--   dispo  - operativ alles ausser Benutzerverwaltung
--   fahrer - lesen, Leerungen/Meldungen erfassen, Sensoren anlernen
--   anon   - ausschliesslich die oeffentliche Kartenansicht
-- ============================================================================

alter table public.benutzerprofil    enable row level security;
alter table public.container         enable row level security;
alter table public.sensor            enable row level security;
alter table public.sensor_geheimnis  enable row level security;
alter table public.anlerncode        enable row level security;
alter table public.sensor_kopplung   enable row level security;
alter table public.messung           enable row level security;
alter table public.container_zustand enable row level security;
alter table public.leerung           enable row level security;
alter table public.alarm             enable row level security;
alter table public.meldung           enable row level security;
alter table public.einstellung       enable row level security;

-- ---------------------------------------------------------------------------
-- Benutzerprofile
-- ---------------------------------------------------------------------------
create policy "profil selbst lesen" on public.benutzerprofil
  for select to authenticated
  using (id = auth.uid() or public.ist_mindestens_dispo());

create policy "profil selbst pflegen" on public.benutzerprofil
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and rolle = public.aktuelle_rolle());

create policy "profile durch admin verwalten" on public.benutzerprofil
  for all to authenticated
  using (public.ist_admin())
  with check (public.ist_admin());

-- ---------------------------------------------------------------------------
-- Container
-- ---------------------------------------------------------------------------
create policy "container lesen" on public.container
  for select to authenticated
  using (public.ist_angemeldet());

create policy "container pflegen" on public.container
  for all to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

-- ---------------------------------------------------------------------------
-- Sensoren
-- ---------------------------------------------------------------------------
create policy "sensoren lesen" on public.sensor
  for select to authenticated
  using (public.ist_angemeldet());

create policy "sensoren pflegen" on public.sensor
  for all to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

-- sensor_geheimnis bekommt bewusst KEINE Policy:
-- damit ist die Tabelle fuer anon und authenticated komplett gesperrt und
-- nur ueber die Service-Role (Ingest-Endpunkt) erreichbar.

create policy "anlerncodes lesen" on public.anlerncode
  for select to authenticated
  using (public.ist_angemeldet());

create policy "anlerncodes pflegen" on public.anlerncode
  for all to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

create policy "kopplungen lesen" on public.sensor_kopplung
  for select to authenticated
  using (public.ist_angemeldet());

-- Geschrieben wird ausschliesslich ueber sensor_koppeln() / sensor_entkoppeln()
create policy "kopplungen pflegen" on public.sensor_kopplung
  for all to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

-- ---------------------------------------------------------------------------
-- Messwerte und Zustand
-- ---------------------------------------------------------------------------
create policy "messungen lesen" on public.messung
  for select to authenticated
  using (public.ist_angemeldet());

-- Einfuegen macht nur der Ingest-Endpunkt (Service-Role, umgeht RLS).
create policy "messungen korrigieren" on public.messung
  for update to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

create policy "zustand lesen" on public.container_zustand
  for select to authenticated
  using (public.ist_angemeldet());

-- ---------------------------------------------------------------------------
-- Leerungen, Alarme, Meldungen: auch Fahrpersonal darf erfassen
-- ---------------------------------------------------------------------------
create policy "leerungen lesen" on public.leerung
  for select to authenticated
  using (public.ist_angemeldet());

create policy "leerungen erfassen" on public.leerung
  for insert to authenticated
  with check (public.ist_angemeldet());

create policy "leerungen korrigieren" on public.leerung
  for update to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

create policy "leerungen loeschen" on public.leerung
  for delete to authenticated
  using (public.ist_mindestens_dispo());

create policy "alarme lesen" on public.alarm
  for select to authenticated
  using (public.ist_angemeldet());

create policy "alarme quittieren" on public.alarm
  for update to authenticated
  using (public.ist_angemeldet())
  with check (public.ist_angemeldet());

create policy "meldungen lesen" on public.meldung
  for select to authenticated
  using (public.ist_angemeldet());

create policy "meldungen erfassen" on public.meldung
  for insert to authenticated
  with check (public.ist_angemeldet());

create policy "meldungen erledigen" on public.meldung
  for update to authenticated
  using (public.ist_angemeldet())
  with check (public.ist_angemeldet());

-- ---------------------------------------------------------------------------
-- Einstellungen
-- ---------------------------------------------------------------------------
create policy "einstellungen lesen" on public.einstellung
  for select to authenticated
  using (public.ist_angemeldet());

create policy "einstellungen pflegen" on public.einstellung
  for all to authenticated
  using (public.ist_admin())
  with check (public.ist_admin());

-- ===========================================================================
-- Oeffentliche Kartenansicht (ohne Anmeldung)
--
-- Bewusst reduziert: Standort, Fuellstandsstufe, Alter der Messung und
-- Aufstelldatum. Keine Sensordaten, keine Batteriewerte, keine Meldungen,
-- keine Rohabstaende - damit ueber die Ansicht nichts Betriebsinternes
-- nach aussen gelangt.
-- ===========================================================================
create view public.oeffentliche_container
with (security_invoker = false)
as
select
  c.id,
  c.nummer,
  c.bezeichnung,
  c.strasse,
  c.plz,
  c.ort,
  c.lat,
  c.lng,
  c.typ,
  c.aufstelldatum,
  -- Alter des Containers am Standort in Tagen
  case when c.aufstelldatum is null then null
       else (current_date - c.aufstelldatum) end as standtage,
  -- Fuellstand bewusst nur grob nach aussen: 10er-Schritte, immer aufgerundet.
  -- Aufgerundet, weil ein zu voll gemeldeter Container hoechstens eine
  -- unnoetige Fahrt kostet, ein zu leer gemeldeter dagegen eine vergebliche.
  -- Die Stufe wird aus demselben gerundeten Wert gebildet, damit Zahl und
  -- Text auf der Karte nie auseinanderlaufen ("50 %" und zugleich "Frei").
  gerundet.wert as fuellstand_prozent,
  public.fuellstand_stufe(gerundet.wert) as stufe,
  z.gemessen_am,
  case when z.gemessen_am is null then null
       else round(extract(epoch from (now() - z.gemessen_am)) / 3600.0, 1) end as stunden_seit_messung
from public.container c
left join public.container_zustand z on z.container_id = c.id
cross join lateral (
  select case
    when z.fuellstand_prozent is null then null
    else least(100, ceil(z.fuellstand_prozent / 10.0) * 10)::smallint
  end as wert
) gerundet
where c.oeffentlich
  and c.status = 'aktiv'
  and c.lat is not null
  and c.lng is not null
  and coalesce((select (wert #>> '{}')::boolean from public.einstellung where schluessel = 'oeffentliche_karte'), true);

comment on view public.oeffentliche_container is
  'Reduzierte Containerliste fuer die oeffentliche Karte - ohne Anmeldung lesbar.';

grant select on public.oeffentliche_container to anon, authenticated;

-- ===========================================================================
-- Ausfuehrungsrechte der Funktionen
--
-- ACHTUNG, leicht zu uebersehen: PostgreSQL vergibt EXECUTE auf jede neue
-- Funktion automatisch an PUBLIC. Ein blosses "grant execute ... to
-- authenticated" schraenkt deshalb GAR NICHTS ein - die Funktion bliebe ueber
-- /rest/v1/rpc/... auch ohne Anmeldung aufrufbar. Erst entziehen, dann
-- gezielt vergeben.
-- ===========================================================================
revoke execute on function public.einstellung_zahl(text, numeric)        from public, anon, authenticated;
revoke execute on function public.fuellstand_stufe(smallint)             from public, anon, authenticated;
revoke execute on function public.berechne_fuellstand(integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.setze_geaendert_am()                   from public, anon, authenticated;
revoke execute on function public.aktuelle_rolle()                       from public, anon, authenticated;
revoke execute on function public.ist_admin()                            from public, anon, authenticated;
revoke execute on function public.ist_mindestens_dispo()                 from public, anon, authenticated;
revoke execute on function public.ist_angemeldet()                       from public, anon, authenticated;
revoke execute on function public.neuen_benutzer_anlegen()               from public, anon, authenticated;
revoke execute on function public.messung_vorbereiten()                  from public, anon, authenticated;
revoke execute on function public.messung_nachbereiten()                 from public, anon, authenticated;
revoke execute on function public.leerung_nachbereiten()                 from public, anon, authenticated;
revoke execute on function public.pruefe_stille_sensoren()               from public, anon, authenticated;
revoke execute on function public.tourenliste(smallint)                  from public, anon, authenticated;
revoke execute on function public.sensor_koppeln(text, uuid, double precision, double precision, boolean, text) from public, anon, authenticated;
revoke execute on function public.container_kalibrieren(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.sensor_entkoppeln(uuid, text)          from public, anon, authenticated;

-- Diese vier Praedikate stehen in den Zugriffsregeln selbst. Ohne EXECUTE
-- scheitert jede Abfrage angemeldeter Nutzer mit "permission denied".
grant execute on function public.aktuelle_rolle()          to authenticated;
grant execute on function public.ist_admin()               to authenticated;
grant execute on function public.ist_mindestens_dispo()    to authenticated;
grant execute on function public.ist_angemeldet()          to authenticated;

-- Wird von tourenliste() mitgerufen.
grant execute on function public.einstellung_zahl(text, numeric) to authenticated;

-- Reine Rechenfunktion, steckt in der oeffentlichen Ansicht.
grant execute on function public.fuellstand_stufe(smallint) to anon, authenticated;

-- Fachliche Aufrufe der Anwendung.
grant execute on function public.tourenliste(smallint) to authenticated;
grant execute on function public.sensor_koppeln(text, uuid, double precision, double precision, boolean, text) to authenticated;
grant execute on function public.container_kalibrieren(uuid, integer, integer) to authenticated;
grant execute on function public.sensor_entkoppeln(uuid, text) to authenticated;

-- pruefe_stille_sensoren() ruft ausschliesslich der Server mit der
-- Service-Role auf - die umgeht diese Rechte ohnehin.
