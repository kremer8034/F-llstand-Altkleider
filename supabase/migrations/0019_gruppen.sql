-- ============================================================================
-- 0019_gruppen.sql
--
-- Bereitschaften: die Organisationseinheit ueber Standorten und Touren.
--
-- Beim BRK Miltenberg kuemmern sich mehrere Bereitschaften um jeweils eigene
-- Plaetze und fahren ihre eigenen Touren. Bisher sah jeder Disponent alles und
-- konnte alles aendern - fachlich falsch und im Betrieb gefaehrlich: wer die
-- Tour einer fremden Bereitschaft umstellt, merkt es nicht, und die andere
-- Seite merkt es erst am Fahrzeug.
--
-- Vier Dinge:
--   a) Tabelle gruppe             - Stammdaten samt Ansprechpartner
--   b) gruppe_id an standort, route und tour
--   c) Tabelle benutzer_gruppe    - wer welche Bereitschaft verwalten darf
--   d) Zugriffsregeln, die daraus folgen
--
-- Der Container bekommt AUSDRUECKLICH keine Gruppe. Er steht auf einem Platz,
-- und der Platz gehoert zur Bereitschaft - eine zweite Zuordnung koennte der
-- ersten widersprechen, und dann waere unklar, welche gilt.
--
-- ---------------------------------------------------------------------------
-- Die beiden Regeln, ohne die das Ganze im Betrieb nicht aufgeht
-- ---------------------------------------------------------------------------
--
-- 1. WER KEINER GRUPPE ZUGEORDNET IST, SIEHT ALLES.
--
--    Das ist der Zustand unmittelbar nach dem Einspielen: es gibt noch keine
--    Gruppen und keine Zuordnungen, also aendert sich fuer niemanden etwas.
--    Die Einschraenkung entsteht erst in dem Moment, in dem ein Konto einer
--    Bereitschaft zugeordnet wird - das ist dann eine bewusste Entscheidung
--    der Administration und keine Nebenwirkung eines Datenbankschritts.
--
-- 2. WAS KEINER GRUPPE ZUGEORDNET IST, SEHEN ALLE.
--
--    Ein Standort ohne Bereitschaft ist gemeinsame Sache, nicht Niemandsland.
--    Andernfalls waere jeder Platz, den die Administration noch nicht
--    zugeordnet hat, fuer die Disposition unsichtbar - und unsichtbare
--    Standorte werden nicht angefahren.
--
-- Die Administration ist von beidem ausgenommen: sie sieht immer alles, sonst
-- koennte sie die Zuordnung nicht pflegen, die sie selbst aussperrt.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Die Bereitschaft
-- ---------------------------------------------------------------------------
create table if not exists public.gruppe (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,               -- "Bereitschaft Grossheubach"
  ansprechpartner text,
  telefon         text,
  email           text,
  bemerkung       text,
  aktiv           boolean not null default true,
  angelegt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),

  constraint gruppe_name_gesetzt check (btrim(name) <> '')
);

-- Der Name ist die Kennung, unter der die Bereitschaft im Haus gefuehrt wird -
-- zweimal derselbe waere in jeder Auswahlliste eine Verwechslung.
create unique index if not exists gruppe_name_eindeutig
  on public.gruppe (lower(btrim(name)));

create trigger gruppe_geaendert before update on public.gruppe
  for each row execute function public.setze_geaendert_am();

comment on table public.gruppe is
  'Organisationseinheit (Bereitschaft): betreut eigene Standorte und faehrt eigene Touren.';
comment on column public.gruppe.ansprechpartner is
  'Wer im Haus fuer diese Bereitschaft zustaendig ist - Name, Telefon und E-Mail daneben.';

-- ---------------------------------------------------------------------------
-- b) Die Zuordnung an den Sachen selbst
--
-- Ueberall "on delete set null": wird eine Bereitschaft aufgeloest, bleiben
-- ihre Standorte und Touren bestehen und fallen in die gemeinsame Zustaendig-
-- keit zurueck. Das Gegenteil - Standorte mit der Gruppe zu loeschen - waere
-- ein Datenverlust aus einem Organisationsschritt heraus.
-- ---------------------------------------------------------------------------
alter table public.standort
  add column if not exists gruppe_id uuid references public.gruppe (id) on delete set null;
alter table public.route
  add column if not exists gruppe_id uuid references public.gruppe (id) on delete set null;
alter table public.tour
  add column if not exists gruppe_id uuid references public.gruppe (id) on delete set null;

create index if not exists standort_gruppe_idx on public.standort (gruppe_id);
create index if not exists route_gruppe_idx    on public.route (gruppe_id);
create index if not exists tour_gruppe_idx     on public.tour (gruppe_id, datum desc);

comment on column public.standort.gruppe_id is
  'Betreuende Bereitschaft. Nicht gesetzt heisst: gemeinsame Zustaendigkeit, fuer alle sichtbar.';
comment on column public.route.gruppe_id is
  'Bereitschaft, die diese Regeltour faehrt. Wird an die daraus erzeugte Tagestour vererbt.';
comment on column public.tour.gruppe_id is
  'Bereitschaft, die diesen Fahrauftrag faehrt.';

-- ---------------------------------------------------------------------------
-- c) Wer welche Bereitschaft verwalten darf
--
-- Eine eigene Tabelle statt einer Spalte am Profil: ein Disponent kann fuer
-- zwei Bereitschaften zustaendig sein (Urlaubsvertretung ist der Regelfall,
-- nicht die Ausnahme). Mit einer Spalte muesste man dafuer ein zweites Konto
-- anlegen - und zwei Konten fuer einen Menschen sind der Anfang davon, dass
-- niemand mehr weiss, wer was geaendert hat.
-- ---------------------------------------------------------------------------
create table if not exists public.benutzer_gruppe (
  benutzer_id uuid not null references public.benutzerprofil (id) on delete cascade,
  gruppe_id   uuid not null references public.gruppe (id)         on delete cascade,
  angelegt_am timestamptz not null default now(),

  primary key (benutzer_id, gruppe_id)
);

create index if not exists benutzer_gruppe_gruppe_idx on public.benutzer_gruppe (gruppe_id);

comment on table public.benutzer_gruppe is
  'Berechtigung je Bereitschaft. Ohne Eintrag gilt fuer das Konto die alte Lage: es sieht alles.';

-- ---------------------------------------------------------------------------
-- d) Das Praedikat, das in allen Regeln steht
--
-- security definer, weil die Regel ueber benutzer_gruppe liest und diese
-- Tabelle selbst durch Zugriffsregeln geschuetzt ist - sonst pruefte sich die
-- Regel im Kreis.
-- ---------------------------------------------------------------------------
create or replace function public.gruppe_sichtbar(p_gruppe_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Die Administration sieht alles.
    public.ist_admin()
    -- Kein Eintrag in benutzer_gruppe: das Konto ist nicht gebunden.
    or not exists (
      select 1 from public.benutzer_gruppe where benutzer_id = auth.uid()
    )
    -- Herrenlose Sachen gehen alle an.
    or p_gruppe_id is null
    -- Sonst: nur die eigenen Bereitschaften.
    or exists (
      select 1 from public.benutzer_gruppe
       where benutzer_id = auth.uid() and gruppe_id = p_gruppe_id
    );
$$;

comment on function public.gruppe_sichtbar is
  'Darf der Aufrufer eine Sache dieser Bereitschaft sehen und aendern? Siehe Kopf von 0019_gruppen.sql.';

/** Die eigenen Bereitschaften - fuer die Oberflaeche, nicht fuer die Regeln. */
create or replace function public.meine_gruppen()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select gruppe_id from public.benutzer_gruppe where benutzer_id = auth.uid();
$$;

comment on function public.meine_gruppen is
  'Bereitschaften des angemeldeten Kontos. Leer heisst: keine Bindung, also alles sichtbar.';

-- ---------------------------------------------------------------------------
-- e) Zugriffsregeln der neuen Tabellen
-- ---------------------------------------------------------------------------
alter table public.gruppe          enable row level security;
alter table public.benutzer_gruppe enable row level security;

-- Lesen duerfen alle Angemeldeten: der Name der Bereitschaft steht an Tour und
-- Standort und muss sich anzeigen lassen, auch von einer fremden Gruppe aus.
-- Die Kontaktdaten des Ansprechpartners sind Dienstdaten, keine privaten.
create policy "gruppen lesen" on public.gruppe
  for select to authenticated using (public.ist_angemeldet());

-- Anlegen und Aendern nur die Administration: eine Bereitschaft ist eine
-- Aussage ueber die Organisation, nicht ueber die Tagesplanung. Koennte die
-- Disposition sie aendern, koennte sie sich damit auch selbst zuschanzen, was
-- die Trennung gerade verhindern soll.
create policy "gruppen verwalten" on public.gruppe
  for all to authenticated
  using (public.ist_admin()) with check (public.ist_admin());

create policy "eigene gruppenrechte lesen" on public.benutzer_gruppe
  for select to authenticated
  using (benutzer_id = auth.uid() or public.ist_mindestens_dispo());

create policy "gruppenrechte verwalten" on public.benutzer_gruppe
  for all to authenticated
  using (public.ist_admin()) with check (public.ist_admin());

grant select, insert, update, delete on public.gruppe          to authenticated;
grant select, insert, update, delete on public.benutzer_gruppe to authenticated;

revoke execute on function public.gruppe_sichtbar(uuid) from public, anon;
revoke execute on function public.meine_gruppen()       from public, anon;
grant  execute on function public.gruppe_sichtbar(uuid) to authenticated;
grant  execute on function public.meine_gruppen()       to authenticated;

-- ---------------------------------------------------------------------------
-- f) Die vorhandenen Regeln um die Bereitschaft erweitern
--
-- Die Regeln werden ersetzt, nicht ergaenzt: mehrere zulassende Regeln fuer
-- dieselbe Operation werden mit ODER verknuepft: eine zweite Regel neben der
-- alten wuerde die Einschraenkung wieder aufheben.
-- ---------------------------------------------------------------------------

-- standort ------------------------------------------------------------------
drop policy if exists "standorte lesen"   on public.standort;
drop policy if exists "standorte pflegen" on public.standort;

create policy "standorte lesen" on public.standort
  for select to authenticated
  using (public.ist_angemeldet() and public.gruppe_sichtbar(gruppe_id));

create policy "standorte pflegen" on public.standort
  for all to authenticated
  using (public.ist_mindestens_dispo() and public.gruppe_sichtbar(gruppe_id))
  with check (public.ist_mindestens_dispo() and public.gruppe_sichtbar(gruppe_id));

-- route ---------------------------------------------------------------------
drop policy if exists "routen lesen"   on public.route;
drop policy if exists "routen pflegen" on public.route;

create policy "routen lesen" on public.route
  for select to authenticated
  using (public.ist_angemeldet() and public.gruppe_sichtbar(gruppe_id));

create policy "routen pflegen" on public.route
  for all to authenticated
  using (public.ist_mindestens_dispo() and public.gruppe_sichtbar(gruppe_id))
  with check (public.ist_mindestens_dispo() and public.gruppe_sichtbar(gruppe_id));

-- route_standort ------------------------------------------------------------
-- Die Zuordnung haengt an beiden Enden. Sichtbar ist sie, wenn die Regeltour
-- sichtbar ist; die Unterabfrage laeuft unter den Regeln von route und traegt
-- deren Einschraenkung damit von selbst mit.
drop policy if exists "routenzuordnung lesen"   on public.route_standort;
drop policy if exists "routenzuordnung pflegen" on public.route_standort;

create policy "routenzuordnung lesen" on public.route_standort
  for select to authenticated
  using (
    public.ist_angemeldet()
    and exists (select 1 from public.route r where r.id = route_id)
  );

create policy "routenzuordnung pflegen" on public.route_standort
  for all to authenticated
  using (
    public.ist_mindestens_dispo()
    and exists (select 1 from public.route r where r.id = route_id)
  )
  with check (
    public.ist_mindestens_dispo()
    and exists (select 1 from public.route    r where r.id = route_id)
    and exists (select 1 from public.standort s where s.id = standort_id)
  );

-- tour ----------------------------------------------------------------------
-- Das Fahrpersonal sieht seine eigene Tour immer, auch wenn es einer anderen
-- Bereitschaft zugeordnet ist. Wer heute faehrt, muss den Auftrag lesen
-- koennen - Aushilfe ueber Bereitschaftsgrenzen hinweg ist der Normalfall.
drop policy if exists "touren lesen"   on public.tour;
drop policy if exists "touren pflegen" on public.tour;

create policy "touren lesen" on public.tour
  for select to authenticated
  using (
    public.ist_angemeldet()
    and (public.gruppe_sichtbar(gruppe_id) or fahrer_id = auth.uid())
  );

create policy "touren pflegen" on public.tour
  for all to authenticated
  using (public.ist_mindestens_dispo() and public.gruppe_sichtbar(gruppe_id))
  with check (public.ist_mindestens_dispo() and public.gruppe_sichtbar(gruppe_id));

-- tour_stopp ----------------------------------------------------------------
drop policy if exists "tourstopps lesen"   on public.tour_stopp;
drop policy if exists "tourstopps pflegen" on public.tour_stopp;

create policy "tourstopps lesen" on public.tour_stopp
  for select to authenticated
  using (
    public.ist_angemeldet()
    and exists (select 1 from public.tour t where t.id = tour_id)
  );

-- Beim Aufnehmen wird beides geprueft: die Tour UND der Standort muessen dem
-- Aufrufer gehoeren. Sonst liesse sich ein fremder Platz auf die eigene Tour
-- setzen - die Tour waere zulaessig, der Stopp darauf nicht.
create policy "tourstopps pflegen" on public.tour_stopp
  for all to authenticated
  using (
    public.ist_mindestens_dispo()
    and exists (select 1 from public.tour t where t.id = tour_id)
  )
  with check (
    public.ist_mindestens_dispo()
    and exists (select 1 from public.tour     t where t.id = tour_id)
    and exists (select 1 from public.standort s where s.id = standort_id)
  );

-- tour_container ------------------------------------------------------------
drop policy if exists "tourcontainer lesen"   on public.tour_container;
drop policy if exists "tourcontainer pflegen" on public.tour_container;

create policy "tourcontainer lesen" on public.tour_container
  for select to authenticated
  using (
    public.ist_angemeldet()
    and exists (select 1 from public.tour_stopp s where s.id = stopp_id)
  );

create policy "tourcontainer pflegen" on public.tour_container
  for all to authenticated
  using (
    public.ist_mindestens_dispo()
    and exists (select 1 from public.tour_stopp s where s.id = stopp_id)
  )
  with check (
    public.ist_mindestens_dispo()
    and exists (select 1 from public.tour_stopp s where s.id = stopp_id)
  );

-- ---------------------------------------------------------------------------
-- g) Aus der Regeltour erzeugte Tagestour erbt die Bereitschaft
--
-- Sonst entstuende beim haeufigsten Handgriff der Disposition - "aus der
-- Regeltour eine Tour machen" - eine Tour ohne Gruppe, die anschliessend alle
-- sehen und aendern duerfen.
-- ---------------------------------------------------------------------------
create or replace function public.tour_aus_route(
  p_route_id  uuid,
  p_datum     date default current_date,
  p_fahrer_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tour_id uuid;
  v_name    text;
  v_gruppe  uuid;
begin
  if not public.ist_mindestens_dispo() then
    raise exception 'Touren anlegen ist der Disposition vorbehalten.';
  end if;

  select name, gruppe_id into v_name, v_gruppe from public.route where id = p_route_id;
  if not found then
    raise exception 'Regeltour % gibt es nicht.', p_route_id;
  end if;

  insert into public.tour (name, datum, route_id, fahrer_id, gruppe_id, angelegt_von)
  values (v_name, p_datum, p_route_id, p_fahrer_id, v_gruppe, auth.uid())
  returning id into v_tour_id;

  -- Reihenfolge der Regeltour uebernehmen; wo keine gepflegt ist, nach Namen.
  insert into public.tour_stopp (tour_id, standort_id, position)
  select v_tour_id, rs.standort_id,
         (row_number() over (order by coalesce(rs.position, 32767), st.name))::smallint
    from public.route_standort rs
    join public.standort st on st.id = rs.standort_id
   where rs.route_id = p_route_id
     and st.aktiv;

  return v_tour_id;
end;
$$;

revoke execute on function public.tour_aus_route(uuid, date, uuid) from public, anon;
grant  execute on function public.tour_aus_route(uuid, date, uuid) to authenticated;

comment on function public.tour_aus_route is
  'Legt eine Tagestour aus einer Regeltour an und uebernimmt deren Standorte, Reihenfolge und Bereitschaft.';
