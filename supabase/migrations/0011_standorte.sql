-- ============================================================================
-- 0011_standorte.sql
--
-- Der Standort wird die Einheit der Tourenplanung (siehe docs/tourenplanung.md).
-- Mehrere Container nebeneinander sind ein Stopp; angefahren und geleert wird
-- der Standort als Ganzes.
--
--   a) Tabelle standort und container.standort_id
--   b) Je vorhandenem Container ein eigener Standort - der neutrale
--      Ausgangszustand, von dem aus VON HAND zusammengefuehrt wird
--   c) Ansicht standort_zustand: freie Kapazitaet in Litern statt Fuellstand
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Einstellungen
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung) values
  ('standort_reserve_prozent', '20',
   'Unter dieser freien Restkapazitaet gilt ein Standort als anzufahren.'),
  ('standard_volumen_liter', '2500',
   'Ersatzwert, wenn an einem Container kein Volumen gepflegt ist. Dann zaehlt jeder Container gleich viel.')
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- a) Der Standort
-- ---------------------------------------------------------------------------
create table if not exists public.standort (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  strasse       text,
  plz           text,
  ort           text,
  lat           double precision,
  lng           double precision,
  -- "Einfahrt hinter dem Markt, Poller mit Dreikantschluessel"
  zufahrt       text,
  bemerkung     text,
  aktiv         boolean not null default true,
  angelegt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now(),

  constraint standort_name_gesetzt check (btrim(name) <> ''),
  constraint standort_koordinaten_plausibel check (
    (lat is null and lng is null)
    or (lat between -90 and 90 and lng between -180 and 180)
  )
);

create index if not exists standort_ort_idx on public.standort (ort, name);

create trigger standort_geaendert before update on public.standort
  for each row execute function public.setze_geaendert_am();

alter table public.container
  add column if not exists standort_id uuid references public.standort (id) on delete set null;

create index if not exists container_standort_idx on public.container (standort_id);

comment on table public.standort is
  'Platz, an dem ein oder mehrere Container stehen. Einheit der Tourenplanung.';
comment on column public.standort.zufahrt is
  'Hinweise fuer das Fahrpersonal: Einfahrt, Poller, Schluessel, Wendemoeglichkeit.';

-- ---------------------------------------------------------------------------
-- b) Ausgangszustand: je Container ein eigener Standort
--
-- Bewusst KEINE Gruppierung nach Koordinaten. Zwei Container in Sichtweite
-- koennen an verschiedenen Zufahrten liegen, zwei an derselben Adresse durch
-- eine Bahnlinie getrennt sein - das sieht keine Rechnung. Wer zusammengehoert,
-- entscheidet ein Mensch in der Oberflaeche oder ueber die Spalte
-- "standortname" im CSV-Import.
--
-- Dieser Schritt stellt nur sicher, dass die Planung vom ersten Tag an eine
-- durchgaengige Einheit hat und kein Container ohne Stopp dasteht.
-- ---------------------------------------------------------------------------
with neu as (
  insert into public.standort (name, strasse, plz, ort, lat, lng)
  select coalesce(nullif(btrim(c.bezeichnung), ''), c.nummer),
         c.strasse, c.plz, c.ort, c.lat, c.lng
  from public.container c
  where c.standort_id is null
  returning id, name, coalesce(strasse, '') as strasse, coalesce(ort, '') as ort
)
update public.container c
   set standort_id = n.id
  from neu n
 where c.standort_id is null
   and coalesce(nullif(btrim(c.bezeichnung), ''), c.nummer) = n.name
   and coalesce(c.strasse, '') = n.strasse
   and coalesce(c.ort, '') = n.ort;

-- ---------------------------------------------------------------------------
-- c) Zustand des Standorts
--
-- Restkapazitaet statt Fuellstand: ein Container mit 60 % hat noch 40 % Platz.
--
--   freie_liter = Summe volumen_liter x (100 - Fuellstand) / 100
--
-- Dazu die vorausschauende Haelfte - wie lange haelt der Standort noch:
--
--   zufluss_liter_je_tag = Summe (Rate in %-Punkten/Tag x Volumen / 100)
--   tage_bis_voll        = (freie_liter - Reserve) / zufluss_liter_je_tag
--
-- Vorbehalt, der in docs/tourenplanung.md steht und hier wiederholt gehoert:
-- volle Container nehmen nichts mehr auf, der gemessene Zufluss ist deshalb
-- eine UNTERGRENZE der echten Nachfrage.
-- ---------------------------------------------------------------------------
create or replace view public.standort_zustand
with (security_invoker = true) as
with werte as (
  select public.einstellung_zahl('standort_reserve_prozent', 20) as reserve_prozent,
         public.einstellung_zahl('standard_volumen_liter', 2500) as standard_volumen,
         public.einstellung_zahl('schwelle_voll', 90)            as schwelle_voll
),
je_container as (
  select
    c.standort_id,
    c.id                                                       as container_id,
    c.lat, c.lng,
    coalesce(c.volumen_liter, w.standard_volumen)               as volumen,
    z.fuellstand_prozent,
    p.rate_prozent_pro_tag,
    s.id is not null                                            as hat_sensor,
    c.leer_abstand_mm is not null                               as kalibriert
  from public.container c
  cross join werte w
  left join public.container_zustand z  on z.container_id = c.id
  left join public.container_prognose p on p.container_id = c.id
  left join public.sensor s             on s.container_id = c.id
  where c.status = 'aktiv'
),
-- Seit wann liegt ein Container ueber der Vollschwelle? Gemessen ab der
-- ersten Messung im laufenden Zyklus, die die Schwelle erreicht hat.
voll_seit as (
  select m.container_id, min(m.gemessen_am) as seit
  from public.messung m
  cross join werte w
  left join public.container_rhythmus r on r.container_id = m.container_id
  where m.gueltig
    and m.fuellstand_prozent >= w.schwelle_voll
    and m.gemessen_am > coalesce(r.letzte_leerung_am, now() - interval '90 days')
  group by m.container_id
)
select
  st.id                                as standort_id,
  st.name,
  st.ort,
  st.aktiv,
  coalesce(st.lat, avg(jc.lat))        as lat,
  coalesce(st.lng, avg(jc.lng))        as lng,

  count(jc.container_id)::integer                                   as container_gesamt,
  count(*) filter (where jc.hat_sensor)::integer                    as container_mit_sensor,
  count(*) filter (where jc.fuellstand_prozent is null)::integer    as container_ohne_wert,

  round(sum(jc.volumen)::numeric, 0)                                as kapazitaet_liter,
  round(sum(jc.volumen * coalesce(jc.fuellstand_prozent, 0) / 100.0)::numeric, 0) as gefuellt_liter,
  round(sum(jc.volumen * (100 - coalesce(jc.fuellstand_prozent, 0)) / 100.0)::numeric, 0) as freie_liter,
  round((sum(jc.volumen * (100 - coalesce(jc.fuellstand_prozent, 0)) / 100.0)
         / nullif(sum(jc.volumen), 0) * 100)::numeric, 1)           as freie_prozent,

  -- Zufluss: nur Container, die ueberhaupt noch aufnehmen koennen
  round(sum(jc.rate_prozent_pro_tag * jc.volumen / 100.0)
        filter (where coalesce(jc.fuellstand_prozent, 0) < 100)::numeric, 1) as zufluss_liter_je_tag,

  count(*) filter (where jc.fuellstand_prozent >= (select schwelle_voll from werte))::integer as container_voll,
  round(max(extract(epoch from (now() - vs.seit)) / 86400.0)::numeric, 1)    as tage_laengster_voll,

  (select count(*) from public.meldung m
    join public.container c2 on c2.id = m.container_id
   where c2.standort_id = st.id and m.erledigt_am is null)          as offene_meldungen
from public.standort st
left join je_container jc on jc.standort_id = st.id
left join voll_seit vs    on vs.container_id = jc.container_id
group by st.id, st.name, st.ort, st.aktiv, st.lat, st.lng;

comment on view public.standort_zustand is
  'Zustand eines Standorts: freie Restkapazitaet in Litern, Zufluss je Tag, volle Container und offene Meldungen.';

-- ---------------------------------------------------------------------------
-- Zugriffsregeln - wie bei container: lesen fuer Angemeldete, pflegen ab Dispo
-- ---------------------------------------------------------------------------
alter table public.standort enable row level security;

create policy "standorte lesen" on public.standort
  for select to authenticated
  using (public.ist_angemeldet());

create policy "standorte pflegen" on public.standort
  for all to authenticated
  using (public.ist_mindestens_dispo())
  with check (public.ist_mindestens_dispo());

revoke all on public.standort_zustand from public, anon;
grant select on public.standort_zustand to authenticated;
grant select, insert, update, delete on public.standort to authenticated;
