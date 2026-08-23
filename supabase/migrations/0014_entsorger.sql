-- ============================================================================
-- 0014_entsorger.sql
--
-- Wer holt den Muell ab, der im Altkleidercontainer landet?
--
-- Mit den Gemeinden bestehen Absprachen: liegt Restmuell im Container, laesst
-- das Fahrpersonal ihn stehen und ruft den Bauhof an, der ihn abholt. Wo es
-- keine solche Absprache gibt, muss der Muell mitgenommen werden.
--
-- Das Fahrpersonal braucht diese Auskunft am Stopp, in dem Moment, in dem es
-- den Deckel oeffnet - nicht in einer Liste im Buero.
--
--   a) Tabelle entsorger: Bauhof oder Entsorgungsbetrieb je Gemeinde
--   b) standort.entsorger_id
--   c) Ansicht standort_entsorgung: was das Fahrpersonal angezeigt bekommt
--
-- Warum eine eigene Tabelle und nicht drei Felder am Standort?
--
-- Die Auskunft ist zwar STANDORTBEZOGEN gueltig - der Fahrer fragt "wer ist
-- hier zustaendig?" -, ihr Inhalt aber ist gemeindebezogen. Ein Bauhof betreut
-- alle Standorte seiner Gemeinde. Als Felder am Standort stuende dieselbe
-- Rufnummer bei dreissig Standorten, und wenn sie sich aendert, muesste sie
-- dreissig Mal nachgezogen werden - was in der Praxis heisst: an sechs Stellen
-- bleibt die alte stehen, und das Fahrpersonal ruft ins Leere.
--
-- Deshalb: die Kontaktdaten einmal je Bauhof, am Standort nur der Verweis.
-- Die Zuordnung schlaegt die Oberflaeche anhand des Orts vor (Spalte
-- gemeinde), bestaetigen muss sie ein Mensch - Ortsname und Gemeindegebiet
-- sind nicht dasselbe, und ein Standort kann am Ortsrand der Nachbargemeinde
-- liegen.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Der Entsorger
-- ---------------------------------------------------------------------------
create table if not exists public.entsorger (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,                 -- "Bauhof Grossheubach"
  gemeinde     text,                          -- fuer den Vorschlag anhand des Orts
  telefon      text,
  email        text,
  ansprechpartner text,
  -- "Mo-Do 7-15 Uhr, Fr bis 12 Uhr. Ausserhalb: Leitstelle 09371 501-0"
  erreichbar   text,
  bemerkung    text,
  aktiv        boolean not null default true,
  angelegt_am  timestamptz not null default now(),
  geaendert_am timestamptz not null default now(),

  constraint entsorger_name_gesetzt check (btrim(name) <> ''),
  -- Ein Eintrag ohne jede Kontaktmoeglichkeit hilft dem Fahrpersonal nicht und
  -- taeuscht eine Absprache vor, die es nicht gibt.
  constraint entsorger_erreichbar check (
    coalesce(btrim(telefon), '') <> '' or coalesce(btrim(email), '') <> ''
  )
);

create index if not exists entsorger_gemeinde_idx on public.entsorger (gemeinde);

create trigger entsorger_geaendert before update on public.entsorger
  for each row execute function public.setze_geaendert_am();

comment on table public.entsorger is
  'Bauhof oder Entsorgungsbetrieb, der Fremdmuell aus den Containern abholt. Je Gemeinde einmal gepflegt, am Standort nur verwiesen.';
comment on column public.entsorger.gemeinde is
  'Grundlage fuer den Zuordnungsvorschlag: stimmt sie mit standort.ort ueberein, wird dieser Entsorger vorgeschlagen.';
comment on column public.entsorger.erreichbar is
  'Zeiten im Klartext - das Fahrpersonal liest es am Container, nicht die Maschine.';

-- ---------------------------------------------------------------------------
-- b) Verweis am Standort
--
-- Bewusst nullable und ohne Ersatzwert: "kein Entsorger hinterlegt" ist eine
-- gueltige und haeufige Lage, und sie bedeutet etwas Konkretes - der Muell
-- muss mit. Ein Pflichtfeld wuerde dazu verleiten, irgendetwas einzutragen.
-- ---------------------------------------------------------------------------
alter table public.standort
  add column if not exists entsorger_id uuid references public.entsorger (id) on delete set null;

create index if not exists standort_entsorger_idx on public.standort (entsorger_id);

comment on column public.standort.entsorger_id is
  'Zustaendiger Bauhof. Ist er nicht gesetzt, gibt es keine Absprache - der Muell wird mitgenommen.';

-- ---------------------------------------------------------------------------
-- c) Was das Fahrpersonal angezeigt bekommt
--
-- Eine Ansicht statt einer Verknuepfung in jeder Abfrage: die Unterscheidung
-- "anrufen" / "mitnehmen" soll an genau einer Stelle getroffen werden, damit
-- Fahreransicht und Standortseite nicht auseinanderlaufen koennen.
-- ---------------------------------------------------------------------------
create or replace view public.standort_entsorgung
with (security_invoker = true) as
select
  s.id                as standort_id,
  s.name              as standort_name,
  s.ort,
  e.id                as entsorger_id,
  e.name              as entsorger_name,
  e.telefon,
  e.email,
  e.ansprechpartner,
  e.erreichbar,
  e.bemerkung         as entsorger_bemerkung,
  -- Die eine Frage, auf die es am Container ankommt.
  (e.id is not null and e.aktiv) as abholung_vereinbart
from public.standort s
left join public.entsorger e on e.id = s.entsorger_id;

comment on view public.standort_entsorgung is
  'Je Standort: gibt es eine Abholvereinbarung, und wen ruft das Fahrpersonal an? Ohne Entsorger wird der Muell mitgenommen.';

-- ---------------------------------------------------------------------------
-- Zugriffsregeln
--
-- Lesen duerfen alle Angemeldeten - das Fahrpersonal braucht die Rufnummer
-- unterwegs. Pflegen ab der Disposition, wie bei den uebrigen Stammdaten.
-- ---------------------------------------------------------------------------
alter table public.entsorger enable row level security;

create policy "entsorger lesen" on public.entsorger
  for select to authenticated
  using (public.ist_angemeldet());

create policy "entsorger pflegen" on public.entsorger
  for all to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

grant select, insert, update, delete on public.entsorger to authenticated;

revoke all on public.standort_entsorgung from public, anon;
grant select on public.standort_entsorgung to authenticated;
