-- ============================================================================
-- 0016_adresse_am_standort.sql
--
-- Der Standort fuehrt die Adresse.
--
-- Bisher trugen container UND standort je Strasse, PLZ, Ort und Koordinaten.
-- Zwei Wahrheiten fuer dieselbe Tatsache: wo steht das Ding? Wer den Container
-- umsetzt, aendert die eine und vergisst die andere - und die Karte zeigt
-- danach zwei verschiedene Orte fuer denselben Platz.
--
-- Ab hier gilt: die Anschrift gehoert zum Standort. Die Spalten am Container
-- BLEIBEN - der CSV-Import aus der Dienstleistungsdatenbank liefert sie, und
-- alte Auswertungen lesen sie. Sie sind ab jetzt Rohdaten der Einlieferung,
-- nicht mehr die gueltige Auskunft.
--
--   a) Standorte, denen die Anschrift fehlt, aus ihren Containern fuellen
--   b) oeffentliche_container: Rueckfall auf die Standortanschrift
--   c) oeffentliche_standorte: der Platz als Einheit fuer die Karte
--
-- Zu b) gehoert ein Fehler, der bisher niemandem auffiel: die oeffentliche
-- Ansicht verlangte Koordinaten AM CONTAINER. Ein Container ohne eigene
-- Koordinaten verschwand von der oeffentlichen Karte, auch wenn sein Standort
-- welche hatte - lautlos, ohne Hinweis.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Anschrift am Standort nachziehen
--
-- Nur, wo am Standort nichts steht: gepflegte Standortdaten sind die bessere
-- Quelle und werden nicht ueberschrieben. Als Koordinate der Mittelwert der
-- Container - bei einem Container ist das dessen Punkt, bei mehreren die Mitte
-- des Platzes, was fuer die Routenplanung genau richtig ist.
-- ---------------------------------------------------------------------------
with aus_containern as (
  select
    c.standort_id,
    (array_agg(c.strasse) filter (where c.strasse is not null))[1] as strasse,
    (array_agg(c.plz)     filter (where c.plz     is not null))[1] as plz,
    (array_agg(c.ort)     filter (where c.ort     is not null))[1] as ort,
    avg(c.lat) filter (where c.lat is not null)                    as lat,
    avg(c.lng) filter (where c.lng is not null)                    as lng
  from public.container c
  where c.standort_id is not null
  group by c.standort_id
)
update public.standort s
   set strasse = coalesce(s.strasse, a.strasse),
       plz     = coalesce(s.plz,     a.plz),
       ort     = coalesce(s.ort,     a.ort),
       lat     = coalesce(s.lat,     a.lat),
       lng     = coalesce(s.lng,     a.lng)
  from aus_containern a
 where a.standort_id = s.id
   and (s.strasse is null or s.plz is null or s.ort is null
        or s.lat is null or s.lng is null);

comment on column public.container.strasse is
  'Rohdaten aus dem Import. Gueltig ist die Anschrift des Standorts.';
comment on column public.container.lat is
  'Rohdaten aus dem Import. Fuer Karte und Routenplanung zaehlt der Standort.';
comment on column public.container.lng is
  'Rohdaten aus dem Import. Fuer Karte und Routenplanung zaehlt der Standort.';

-- ---------------------------------------------------------------------------
-- b) Oeffentliche Containerliste mit Rueckfall auf den Standort
--
-- Die vorhandenen Spalten bleiben unveraendert: /api/oeffentlich/container ist
-- in docs/api.md beschrieben und wird ausserhalb eingebunden. Was sich aendert,
-- ist die Herkunft der Werte - und dass Container mit Standortkoordinaten
-- nicht mehr aus der Karte fallen. Dazu kommt standort_id; eine zusaetzliche
-- Spalte bricht keinen Abnehmer, eine geaenderte schon.
-- ---------------------------------------------------------------------------
-- Neu anlegen statt ersetzen: create or replace view kann keine Spalte
-- hinzufuegen, und die Rechte werden unten wieder gesetzt.
drop view if exists public.oeffentliche_container;

create view public.oeffentliche_container
with (security_invoker = false)
as
select
  c.id,
  c.nummer,
  -- Der Platz, zu dem dieser Container gehoert. Zusaetzliche Spalte, keine
  -- geaenderte: die Seite hinter dem QR-Code muss den eigenen Platz aus der
  -- Umgebungsliste herausnehmen koennen, und ein Namensvergleich waere dafuer
  -- zu wacklig. Die Kennung ist ueber oeffentliche_standorte ohnehin sichtbar.
  c.standort_id,
  -- Der Platzname sagt dem Buerger mehr als die Containerbezeichnung.
  coalesce(st.name, c.bezeichnung)   as bezeichnung,
  coalesce(st.strasse, c.strasse)    as strasse,
  coalesce(st.plz, c.plz)            as plz,
  coalesce(st.ort, c.ort)            as ort,
  coalesce(c.lat, st.lat)            as lat,
  coalesce(c.lng, st.lng)            as lng,
  c.typ,
  c.aufstelldatum,
  case when c.aufstelldatum is null then null
       else (current_date - c.aufstelldatum) end as standtage,
  gerundet.wert as fuellstand_prozent,
  public.fuellstand_stufe(gerundet.wert) as stufe,
  z.gemessen_am,
  case when z.gemessen_am is null then null
       else round(extract(epoch from (now() - z.gemessen_am)) / 3600.0, 1) end as stunden_seit_messung
from public.container c
left join public.container_zustand z on z.container_id = c.id
left join public.standort st         on st.id = c.standort_id
cross join lateral (
  select case
    when z.fuellstand_prozent is null then null
    else least(100, ceil(z.fuellstand_prozent / 10.0) * 10)::smallint
  end as wert
) gerundet
where c.oeffentlich
  and c.status = 'aktiv'
  and coalesce(st.aktiv, true)
  and coalesce(c.lat, st.lat) is not null
  and coalesce(c.lng, st.lng) is not null
  and coalesce((select (wert #>> '{}')::boolean from public.einstellung where schluessel = 'oeffentliche_karte'), true);

comment on view public.oeffentliche_container is
  'Reduzierte Containerliste fuer die oeffentliche Karte. Anschrift und Koordinaten fallen auf den Standort zurueck.';

-- Die Ansicht wurde neu angelegt, also sind die Rechte von 0003 weg.
grant select on public.oeffentliche_container to anon, authenticated;

-- ---------------------------------------------------------------------------
-- c) Der Platz als Einheit
--
-- Fuer den Buerger ist die Frage nicht "welcher Container", sondern "wo kann
-- ich meine Tuete abgeben". Stehen drei Container auf demselben Parkplatz,
-- sind das keine drei Antworten, sondern eine.
--
-- Deshalb eine eigene Ansicht statt einer Aenderung an oeffentliche_container:
-- die Containerliste ist eine beschriebene Schnittstelle und bleibt, wie sie
-- ist. Die Karte und die Seite hinter dem QR-Code nehmen diese hier.
--
-- Gerechnet wird auf denselben GERUNDETEN Werten wie oben, damit die Karte
-- nicht "50 %" sagt, wo die Containerliste "47 %" meldet.
-- ---------------------------------------------------------------------------
create or replace view public.oeffentliche_standorte
with (security_invoker = false)
as
with sichtbar as (
  select
    c.standort_id,
    c.id                                   as container_id,
    coalesce(c.volumen_liter,
             public.einstellung_zahl('standard_volumen_liter', 2500)) as volumen,
    gerundet.wert                          as fuellstand,
    z.gemessen_am
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
    and c.standort_id is not null
)
select
  st.id                                  as standort_id,
  st.name,
  st.strasse,
  st.plz,
  st.ort,
  st.lat,
  st.lng,
  count(s.container_id)::integer         as container_gesamt,
  -- Wonach der Buerger wirklich fragt: nimmt hier ueberhaupt noch etwas auf?
  count(*) filter (
    where s.fuellstand is null or s.fuellstand < 90
  )::integer                             as container_mit_platz,
  round((sum(s.volumen * (100 - coalesce(s.fuellstand, 0)) / 100.0)
         / nullif(sum(s.volumen), 0) * 100)::numeric, 0) as freie_prozent,
  -- Stufe des leersten Containers: eine Tuete passt dorthin, wo Platz ist,
  -- nicht in den Durchschnitt.
  public.fuellstand_stufe(min(s.fuellstand)::smallint) as stufe,
  max(s.gemessen_am)                     as gemessen_am,
  case when max(s.gemessen_am) is null then null
       else round(extract(epoch from (now() - max(s.gemessen_am))) / 3600.0, 1)
  end                                    as stunden_seit_messung
from public.standort st
join sichtbar s on s.standort_id = st.id
where st.aktiv
  and st.lat is not null
  and st.lng is not null
  and coalesce((select (wert #>> '{}')::boolean from public.einstellung where schluessel = 'oeffentliche_karte'), true)
group by st.id, st.name, st.strasse, st.plz, st.ort, st.lat, st.lng;

comment on view public.oeffentliche_standorte is
  'Oeffentliche Platzliste: ein Eintrag je Standort mit freier Kapazitaet und Zahl der Container, die noch aufnehmen. Grundlage der Karte und der Seite hinter dem QR-Code.';

grant select on public.oeffentliche_standorte to anon, authenticated;
