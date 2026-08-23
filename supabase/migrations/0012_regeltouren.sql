-- ============================================================================
-- 0012_regeltouren.sql
--
-- Regeltouren und die neue Tourenplanung auf Standort-Ebene
-- (docs/tourenplanung.md, Abschnitte 4 und 5).
--
--   a) Kostensaetze als Einstellung
--   b) route und route_standort, Rhythmus als Wochentag + Wochenabstand
--   c) standort_planung: Deckung, Aufschub und die drei Zustaende
--   d) tourenplanung(): loest tourenliste() ab
--
-- Der Kern: ohne Regeltour waere das Kostenurteil schaedlich - isoliert
-- betrachtet lohnt sich kein Stopp, weil ihm die ganze Anfahrt zugerechnet
-- wird. Erst die Deckung macht daraus "lohnt sich JETZT nicht".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Einstellungen
--
-- Die Kostensaetze rechnet die Oberflaeche aus (lib/kosten.ts), weil der Umweg
-- von der geplanten Route abhaengt und die erst dort entsteht. Hier stehen sie,
-- damit es eine einzige Quelle gibt.
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung) values
  ('kosten_pro_km',           '0.80', 'Sachkosten je Kilometer: Sprit, Verschleiss, Reifen, Wartung.'),
  ('kosten_pro_stunde',      '45.00', 'Personalkosten je Stunde einschliesslich Lohnnebenkosten.'),
  ('minuten_je_stopp',           '8', 'Feste Zeit am Standort: anhalten, aufschliessen, sichern.'),
  ('minuten_je_container',       '4', 'Zeit je Container am Standort.'),
  ('durchschnitt_kmh',          '45', 'Reisegeschwindigkeit fuer die Zeitrechnung.'),
  ('max_tage_ueber_schwelle',    '7', 'Danach kommt ein Container auf die Tour, egal was die Kosten sagen.')
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- b) Regeltouren
--
-- "Jeden zweiten Dienstag" = Wochentag 2, Intervall 2 Wochen, dazu ein
-- Ankerdatum, das einen tatsaechlichen Termin festlegt. Daraus laesst sich
-- jeder kuenftige Termin ausrechnen, ohne eine Terminliste zu pflegen.
--
-- Wochentag nach ISO: 1 = Montag ... 7 = Sonntag. Die Pruefbedingung haelt
-- Ankerdatum und Wochentag zusammen - ein Ankerdatum, das auf einen Mittwoch
-- faellt, laesst sich nicht als Dienstagstour speichern.
-- ---------------------------------------------------------------------------
create table if not exists public.route (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  farbe            text,
  wochentag        smallint not null,
  intervall_wochen smallint not null default 1,
  anker_datum      date not null,
  aktiv            boolean not null default true,
  bemerkung        text,
  angelegt_am      timestamptz not null default now(),
  geaendert_am     timestamptz not null default now(),

  constraint route_name_gesetzt      check (btrim(name) <> ''),
  constraint route_wochentag_gueltig check (wochentag between 1 and 7),
  constraint route_intervall_gueltig check (intervall_wochen between 1 and 52),
  constraint route_anker_passt       check (extract(isodow from anker_datum)::smallint = wochentag)
);

create table if not exists public.route_standort (
  route_id    uuid not null references public.route (id)    on delete cascade,
  standort_id uuid not null references public.standort (id) on delete cascade,
  position    smallint,
  primary key (route_id, standort_id)
);

create index if not exists route_standort_standort_idx on public.route_standort (standort_id);

create trigger route_geaendert before update on public.route
  for each row execute function public.setze_geaendert_am();

comment on table public.route is
  'Regeltour mit festem Rhythmus: Wochentag, Abstand in Wochen und ein Ankerdatum.';
comment on column public.route.wochentag is
  'ISO-Wochentag: 1 = Montag ... 7 = Sonntag.';

-- Naechster Termin einer Route ab einem Stichtag.
create or replace function public.route_naechster_termin(
  p_anker    date,
  p_intervall smallint,
  p_ab       date default current_date
)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  v_periode integer := greatest(1, p_intervall) * 7;
  v_schritte integer;
begin
  if p_anker is null then return null; end if;

  -- Wie viele volle Perioden liegen zwischen Anker und Stichtag? Aufgerundet,
  -- damit der Stichtag selbst noch als Termin gilt.
  v_schritte := ceil((p_ab - p_anker)::numeric / v_periode);
  if v_schritte < 0 then v_schritte := 0; end if;

  return p_anker + (v_schritte * v_periode);
end;
$$;

comment on function public.route_naechster_termin is
  'Naechster Termin einer Regeltour ab einem Stichtag, aus Ankerdatum und Wochenabstand.';

-- ---------------------------------------------------------------------------
-- c) Planungszustand je Standort
--
-- Drei Zustaende statt heute zwei:
--
--   PFLICHT  muss heute mit - Notbremse oder ungedeckt
--   KANN     unter der Reserve, aber die Regeltour kommt rechtzeitig; ob er
--            mitgenommen wird, entscheidet der Umweg (lib/kosten.ts)
--   RUHT     hat Platz und ist gedeckt - kein Thema
-- ---------------------------------------------------------------------------
create or replace view public.standort_planung
with (security_invoker = true) as
with werte as (
  select public.einstellung_zahl('standort_reserve_prozent', 20) as reserve_prozent,
         public.einstellung_zahl('max_tage_ueber_schwelle', 7)   as max_tage_voll,
         public.einstellung_zahl('tour_vorlauf_tage', 3)         as vorlauf
),
plan as (
  select rs.standort_id,
         min(public.route_naechster_termin(r.anker_datum, r.intervall_wochen)) as naechster_besuch,
         min(r.name) filter (
           where public.route_naechster_termin(r.anker_datum, r.intervall_wochen) = (
             select min(public.route_naechster_termin(r2.anker_datum, r2.intervall_wochen))
             from public.route r2
             join public.route_standort rs2 on rs2.route_id = r2.id
             where rs2.standort_id = rs.standort_id and r2.aktiv
           )
         ) as routenname
  from public.route_standort rs
  join public.route r on r.id = rs.route_id
  where r.aktiv
  group by rs.standort_id
)
select
  z.standort_id,
  z.name,
  z.ort,
  z.lat,
  z.lng,
  z.container_gesamt,
  z.container_voll,
  z.kapazitaet_liter,
  z.gefuellt_liter,
  z.freie_liter,
  z.freie_prozent,
  z.zufluss_liter_je_tag,
  z.tage_laengster_voll,
  z.offene_meldungen,

  p.naechster_besuch as naechster_planbesuch_am,
  p.routenname,

  -- Wann ist die Reserve aufgebraucht?
  auf.tage_bis_reserve,
  case when auf.tage_bis_reserve is null then null
       else (current_date + auf.tage_bis_reserve::integer) end as reserve_am,

  -- Gedeckt: die Regeltour kommt, bevor die Reserve aufgebraucht ist
  (p.naechster_besuch is not null
   and (auf.tage_bis_reserve is null
        or p.naechster_besuch <= current_date + auf.tage_bis_reserve::integer)) as gedeckt,

  st.zustand,
  st.grund
from public.standort_zustand z
cross join werte w
left join plan p on p.standort_id = z.standort_id
cross join lateral (
  select case
    when z.zufluss_liter_je_tag is null or z.zufluss_liter_je_tag <= 0 then null
    else greatest(0,
      (z.freie_liter - z.kapazitaet_liter * w.reserve_prozent / 100.0) / z.zufluss_liter_je_tag)
  end as tage_bis_reserve
) auf
cross join lateral (
  select
    coalesce(z.freie_prozent, 100) < w.reserve_prozent as unter_reserve,
    (p.naechster_besuch is not null
     and (auf.tage_bis_reserve is null
          or p.naechster_besuch <= current_date + auf.tage_bis_reserve::integer)) as gedeckt
) lage
cross join lateral (
  select
    case
      when z.tage_laengster_voll >= w.max_tage_voll                      then 'pflicht'
      when z.offene_meldungen > 0                                        then 'pflicht'
      when lage.unter_reserve and not lage.gedeckt                       then 'pflicht'
      when not lage.gedeckt and auf.tage_bis_reserve <= w.vorlauf        then 'pflicht'
      when lage.unter_reserve                                            then 'kann'
      else 'ruht'
    end as zustand,
    case
      when z.tage_laengster_voll >= w.max_tage_voll                      then 'zu_lange_voll'
      when z.offene_meldungen > 0                                        then 'meldung'
      when lage.unter_reserve and not lage.gedeckt                       then 'ungedeckt'
      when not lage.gedeckt and auf.tage_bis_reserve <= w.vorlauf        then 'laeuft_voll'
      when lage.unter_reserve                                            then 'mitnahme'
      else 'ruht'
    end as grund
) st
where z.aktiv;

comment on view public.standort_planung is
  'Planungszustand je Standort: Restkapazitaet, Deckung durch eine Regeltour und die Einstufung in pflicht / kann / ruht.';

-- ---------------------------------------------------------------------------
-- d) Die neue Tourenplanung
--
-- Loest tourenliste() ab: Einheit ist der Standort, nicht der Container.
-- Zurueck kommen Pflicht- und Kann-Stopps; was ruht, taucht nicht auf.
-- ---------------------------------------------------------------------------
drop function if exists public.tourenliste(smallint, numeric);

create or replace function public.tourenplanung()
returns table (
  standort_id             uuid,
  name                    text,
  strasse                 text,
  plz                     text,
  ort                     text,
  zufahrt                 text,
  lat                     double precision,
  lng                     double precision,
  container_gesamt        integer,
  container_voll          integer,
  kapazitaet_liter        numeric,
  ertrag_liter            numeric,
  freie_liter             numeric,
  freie_prozent           numeric,
  tage_laengster_voll     numeric,
  offene_meldungen        bigint,
  tage_bis_reserve        numeric,
  reserve_am              date,
  naechster_planbesuch_am date,
  routenname              text,
  gedeckt                 boolean,
  zustand                 text,
  grund                   text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    pl.standort_id,
    pl.name,
    s.strasse,
    s.plz,
    s.ort,
    s.zufahrt,
    pl.lat,
    pl.lng,
    pl.container_gesamt,
    pl.container_voll,
    pl.kapazitaet_liter,
    pl.gefuellt_liter,
    pl.freie_liter,
    pl.freie_prozent,
    pl.tage_laengster_voll,
    pl.offene_meldungen,
    pl.tage_bis_reserve,
    pl.reserve_am,
    pl.naechster_planbesuch_am,
    pl.routenname,
    pl.gedeckt,
    pl.zustand,
    pl.grund
  from public.standort_planung pl
  join public.standort s on s.id = pl.standort_id
  where pl.zustand in ('pflicht', 'kann')
  order by
    case pl.zustand when 'pflicht' then 0 else 1 end,
    pl.tage_bis_reserve nulls first,
    pl.freie_prozent;
$$;

comment on function public.tourenplanung is
  'Stopps fuer die naechste Tour auf Standort-Ebene: Pflicht (muss heute mit) und Kann (lohnt sich nur, wenn der Umweg klein ist).';

-- ---------------------------------------------------------------------------
-- Zugriffsregeln
-- ---------------------------------------------------------------------------
alter table public.route          enable row level security;
alter table public.route_standort enable row level security;

create policy "routen lesen" on public.route
  for select to authenticated using (public.ist_angemeldet());
create policy "routen pflegen" on public.route
  for all to authenticated
  using (public.ist_mindestens_dispo()) with check (public.ist_mindestens_dispo());

create policy "routenzuordnung lesen" on public.route_standort
  for select to authenticated using (public.ist_angemeldet());
create policy "routenzuordnung pflegen" on public.route_standort
  for all to authenticated
  using (public.ist_mindestens_dispo()) with check (public.ist_mindestens_dispo());

grant select, insert, update, delete on public.route          to authenticated;
grant select, insert, update, delete on public.route_standort to authenticated;

revoke all on public.standort_planung from public, anon;
grant select on public.standort_planung to authenticated;

revoke execute on function public.route_naechster_termin(date, smallint, date) from public, anon, authenticated;
grant  execute on function public.route_naechster_termin(date, smallint, date) to authenticated;

revoke execute on function public.tourenplanung() from public, anon, authenticated;
grant  execute on function public.tourenplanung() to authenticated;
