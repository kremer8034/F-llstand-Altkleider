-- ============================================================================
-- 0015_touren.sql
--
-- Die gefahrene Tour.
--
-- Bis hierher war die Tour ein Vorschlag und sonst nichts: /intern/touren
-- rechnete bei jedem Aufruf aus, welche Stopps faellig sind, und was die
-- Disposition abhakte, stand im Browser und war beim Neuladen weg. Damit
-- laesst sich kein Fahrer beauftragen, keine zweite Tour am selben Tag
-- planen und nicht nachsehen, was gestern tatsaechlich gefahren wurde.
--
-- Hier bekommt die Tour einen Koerper:
--
--   a) tour            - ein Fahrauftrag: Tag, Fahrer, Zustand
--   b) tour_stopp      - die Standorte darin, in Reihenfolge
--   c) tour_container  - was an jedem Stopp tatsaechlich geleert wurde
--   d) tour_fortschritt- Ueberblick fuer die Disposition
--   e) Funktionen fuer den Ablauf
--
-- Verhaeltnis zur Regeltour (0012): die `route` bleibt die VORLAGE - Rhythmus,
-- Gebiet, Deckungsrechnung. Die `tour` ist die INSTANZ - ein konkreter Tag mit
-- einem konkreten Fahrer. Aus einer Regeltour lassen sich beliebig viele
-- Touren erzeugen, und eine Tour kann auch ohne Regeltour entstehen.
-- Mehrere Touren am selben Tag sind ausdruecklich vorgesehen; deshalb steht
-- am Datum keine Eindeutigkeitsbedingung.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Zustaende
--
-- `abgebrochen` ist kein Schoenheitsfehler, sondern der ehrliche Ausgang einer
-- Tour, die wegen Panne oder Wetter nicht zu Ende gefahren wurde. Ohne ihn
-- bliebe sie ewig auf `laeuft` stehen und verfaelschte jede Auswertung.
-- ---------------------------------------------------------------------------
create type public.tourstatus  as enum ('geplant', 'laeuft', 'abgeschlossen', 'abgebrochen');
create type public.stoppstatus as enum ('offen', 'erledigt', 'uebersprungen');

-- ---------------------------------------------------------------------------
-- a) Der Fahrauftrag
-- ---------------------------------------------------------------------------
create table if not exists public.tour (
  id               uuid primary key default gen_random_uuid(),
  name             text,
  datum            date not null default current_date,
  -- Die Regeltour, aus der die Stopps uebernommen wurden. Nur Herkunft:
  -- wird sie geloescht, bleibt die gefahrene Tour bestehen.
  route_id         uuid references public.route (id) on delete set null,
  fahrer_id        uuid references public.benutzerprofil (id) on delete set null,
  status           public.tourstatus not null default 'geplant',
  begonnen_am      timestamptz,
  abgeschlossen_am timestamptz,
  bemerkung        text,
  angelegt_von     uuid references public.benutzerprofil (id) on delete set null,
  angelegt_am      timestamptz not null default now(),
  geaendert_am     timestamptz not null default now(),

  -- Zeitstempel und Zustand duerfen sich nicht widersprechen.
  constraint tour_beginn_passt check (
    (status = 'geplant' and begonnen_am is null)
    or (status <> 'geplant' and begonnen_am is not null)
  ),
  constraint tour_ende_passt check (
    (status in ('abgeschlossen', 'abgebrochen') and abgeschlossen_am is not null)
    or (status in ('geplant', 'laeuft') and abgeschlossen_am is null)
  )
);

create index if not exists tour_datum_idx  on public.tour (datum desc, angelegt_am);
create index if not exists tour_fahrer_idx on public.tour (fahrer_id, datum desc);
create index if not exists tour_status_idx on public.tour (status) where status in ('geplant', 'laeuft');

create trigger tour_geaendert before update on public.tour
  for each row execute function public.setze_geaendert_am();

comment on table public.tour is
  'Ein Fahrauftrag: ein Tag, ein Fahrer, eine Folge von Stopps. Mehrere Touren je Tag sind vorgesehen.';
comment on column public.tour.route_id is
  'Regeltour, aus der die Stopps stammen. Reine Herkunftsangabe - die Tour lebt danach eigenstaendig.';

-- ---------------------------------------------------------------------------
-- b) Die Stopps
-- ---------------------------------------------------------------------------
create table if not exists public.tour_stopp (
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid not null references public.tour (id)     on delete cascade,
  standort_id   uuid not null references public.standort (id) on delete cascade,
  position      smallint not null default 0,
  status        public.stoppstatus not null default 'offen',
  angekommen_am timestamptz,
  erledigt_am   timestamptz,
  erledigt_von  uuid references public.benutzerprofil (id) on delete set null,
  -- Warum uebersprungen, oder was dem Fahrpersonal aufgefallen ist.
  notiz         text,

  -- Ein Standort steht hoechstens einmal auf derselben Tour. Zweimal
  -- hinfahren waere ein Planungsfehler, kein Anwendungsfall.
  constraint tour_stopp_einmalig unique (tour_id, standort_id)
);

create index if not exists tour_stopp_tour_idx     on public.tour_stopp (tour_id, position);
create index if not exists tour_stopp_standort_idx on public.tour_stopp (standort_id, erledigt_am desc);

comment on table public.tour_stopp is
  'Ein Standort auf einer Tour, mit Reihenfolge und Erledigungszustand.';

-- ---------------------------------------------------------------------------
-- c) Was tatsaechlich geleert wurde
--
-- Je Container am Stopp eine Zeile. `geleert = false` ist die wichtige Zeile:
-- der Container war da, wurde aber nicht geleert - Fremdmuell drin, Deckel
-- verklemmt, zugeparkt. Der Grund steht daneben.
--
-- `leerung_id` verweist auf den fachlichen Vorgang in public.leerung. Getrennt
-- gehalten, weil eine Leerung auch ohne Tour erfasst werden kann (Handeintrag
-- der Disposition) und eine Tourzeile auch ohne Leerung existiert (eben dann,
-- wenn nicht geleert wurde).
-- ---------------------------------------------------------------------------
create table if not exists public.tour_container (
  id           uuid primary key default gen_random_uuid(),
  stopp_id     uuid not null references public.tour_stopp (id) on delete cascade,
  container_id uuid not null references public.container (id)  on delete cascade,
  geleert      boolean not null,
  grund        text,
  menge_kg     numeric(8, 1),
  leerung_id   uuid references public.leerung (id) on delete set null,
  erfasst_am   timestamptz not null default now(),
  erfasst_von  uuid references public.benutzerprofil (id) on delete set null,

  -- Traegt die Wiederholung: das Fahrpersonal arbeitet offline und sendet
  -- dieselbe Bestaetigung unter Umstaenden mehrfach nach.
  constraint tour_container_einmalig unique (stopp_id, container_id)
);

create index if not exists tour_container_stopp_idx on public.tour_container (stopp_id);

comment on table public.tour_container is
  'Was an einem Stopp mit jedem einzelnen Container geschehen ist. geleert = false samt Grund ist der interessante Fall.';

-- ---------------------------------------------------------------------------
-- d) Ueberblick fuer die Disposition
--
-- Der Fortschritt einer laufenden Tour, ohne die Position des Fahrzeugs. Was
-- die Disposition wissen muss, ist "wie weit ist er?", nicht "wo ist er?" -
-- das eine steuert die Planung, das andere ueberwacht Menschen.
-- ---------------------------------------------------------------------------
create or replace view public.tour_fortschritt
with (security_invoker = true) as
select
  t.id                                as tour_id,
  t.name,
  t.datum,
  t.status,
  t.route_id,
  r.name                              as routenname,
  t.fahrer_id,
  f.name                              as fahrername,
  t.begonnen_am,
  t.abgeschlossen_am,
  count(s.id)::integer                                            as stopps_gesamt,
  count(*) filter (where s.status = 'erledigt')::integer          as stopps_erledigt,
  count(*) filter (where s.status = 'uebersprungen')::integer     as stopps_uebersprungen,
  count(*) filter (where s.status = 'offen')::integer             as stopps_offen,
  -- Der naechste offene Stopp - was die Disposition auf der Uebersicht sieht.
  (select s2.standort_id from public.tour_stopp s2
    where s2.tour_id = t.id and s2.status = 'offen'
    order by s2.position, s2.id limit 1)                          as naechster_standort_id,
  (select st.name from public.tour_stopp s2
     join public.standort st on st.id = s2.standort_id
    where s2.tour_id = t.id and s2.status = 'offen'
    order by s2.position, s2.id limit 1)                          as naechster_standort,
  (select count(*) from public.tour_container tc
     join public.tour_stopp s3 on s3.id = tc.stopp_id
    where s3.tour_id = t.id and tc.geleert)                       as container_geleert,
  (select count(*) from public.tour_container tc
     join public.tour_stopp s3 on s3.id = tc.stopp_id
    where s3.tour_id = t.id and not tc.geleert)                   as container_stehen_geblieben
from public.tour t
left join public.tour_stopp s      on s.tour_id = t.id
left join public.route r           on r.id = t.route_id
left join public.benutzerprofil f  on f.id = t.fahrer_id
group by t.id, t.name, t.datum, t.status, t.route_id, r.name, t.fahrer_id, f.name,
         t.begonnen_am, t.abgeschlossen_am;

comment on view public.tour_fortschritt is
  'Zustand und Fortschritt je Tour - erledigte und offene Stopps, naechstes Ziel. Ohne Fahrzeugposition.';

-- ---------------------------------------------------------------------------
-- e) Der Ablauf
-- ---------------------------------------------------------------------------

-- Tour aus einer Regeltour erzeugen: Stopps und Reihenfolge werden uebernommen.
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
begin
  if not public.ist_mindestens_dispo() then
    raise exception 'Touren anlegen ist der Disposition vorbehalten.';
  end if;

  select name into v_name from public.route where id = p_route_id;
  if not found then
    raise exception 'Regeltour % gibt es nicht.', p_route_id;
  end if;

  insert into public.tour (name, datum, route_id, fahrer_id, angelegt_von)
  values (v_name, p_datum, p_route_id, p_fahrer_id, auth.uid())
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

comment on function public.tour_aus_route is
  'Legt eine Tagestour aus einer Regeltour an und uebernimmt deren Standorte samt Reihenfolge.';

-- Tour beginnen. Darf der zugewiesene Fahrer selbst, sonst die Disposition.
create or replace function public.tour_starten(p_tour_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.tour%rowtype;
begin
  select * into v from public.tour where id = p_tour_id;
  if not found then
    raise exception 'Tour % gibt es nicht.', p_tour_id;
  end if;

  if v.fahrer_id is distinct from auth.uid() and not public.ist_mindestens_dispo() then
    raise exception 'Diese Tour ist Ihnen nicht zugewiesen.';
  end if;

  -- Schon unterwegs? Dann ist der zweite Druck auf "Tour beginnen" kein
  -- Fehler, sondern eine Wiederholung nach Funkloch - nichts tun.
  if v.status <> 'geplant' then
    return;
  end if;

  update public.tour
     set status = 'laeuft', begonnen_am = now()
   where id = p_tour_id;
end;
$$;

comment on function public.tour_starten is
  'Setzt eine geplante Tour auf laeuft. Mehrfachaufruf ist unschaedlich.';

-- ---------------------------------------------------------------------------
-- Einen Stopp abschliessen.
--
-- Das Herzstueck des Fahrerablaufs, und die Stelle, an der Offlinebetrieb
-- entschieden wird. p_container ist ein JSON-Feld der Form
--
--   [{"container_id": "...", "geleert": true,  "menge_kg": 120},
--    {"container_id": "...", "geleert": false, "grund": "Fremdmuell, Bauhof verstaendigt"}]
--
-- SECURITY DEFINER, weil hier in einem Zug in tour_stopp, tour_container und
-- leerung geschrieben wird und das Ergebnis entweder ganz oder gar nicht
-- gelten soll. Die Berechtigung wird zu Beginn von Hand geprueft.
--
-- WIEDERHOLBAR: derselbe Aufruf zweimal ergibt denselben Zustand und keine
-- zweite Leerung. Ohne diese Eigenschaft waere die Offlinewarteschlange der
-- Fahreransicht nicht zu gebrauchen - sie sendet nach, was sie nicht bestaetigt
-- bekommen hat, und weiss nicht, ob der erste Versuch angekommen ist.
-- ---------------------------------------------------------------------------
create or replace function public.tour_stopp_abschliessen(
  p_stopp_id   uuid,
  p_container  jsonb default '[]'::jsonb,
  p_notiz      text default null,
  p_status     public.stoppstatus default 'erledigt'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stopp     public.tour_stopp%rowtype;
  v_tour      public.tour%rowtype;
  v_eintrag   jsonb;
  v_container uuid;
  v_geleert   boolean;
  v_grund     text;
  v_menge     numeric(8, 1);
  v_vorher    smallint;
  v_leerung   uuid;
  v_anzahl    integer := 0;
begin
  select * into v_stopp from public.tour_stopp where id = p_stopp_id;
  if not found then
    raise exception 'Stopp % gibt es nicht.', p_stopp_id;
  end if;

  select * into v_tour from public.tour where id = v_stopp.tour_id;

  if v_tour.fahrer_id is distinct from auth.uid() and not public.ist_mindestens_dispo() then
    raise exception 'Diese Tour ist Ihnen nicht zugewiesen.';
  end if;

  -- Eine abgeschlossene Tour nimmt nichts mehr an: sonst schiebt eine spaet
  -- nachgesendete Bestaetigung Zahlen in eine bereits ausgewertete Tour.
  if v_tour.status in ('abgeschlossen', 'abgebrochen') then
    return jsonb_build_object('ok', false, 'grund', 'tour_abgeschlossen');
  end if;

  for v_eintrag in select * from jsonb_array_elements(coalesce(p_container, '[]'::jsonb))
  loop
    v_container := nullif(v_eintrag ->> 'container_id', '')::uuid;
    v_geleert   := coalesce((v_eintrag ->> 'geleert')::boolean, true);
    v_grund     := nullif(btrim(coalesce(v_eintrag ->> 'grund', '')), '');
    v_menge     := nullif(v_eintrag ->> 'menge_kg', '')::numeric;

    if v_container is null then
      continue;
    end if;

    -- Gehoert der Container ueberhaupt an diesen Standort? Sonst liesse sich
    -- ueber einen fremden Stopp jede beliebige Leerung erzeugen.
    if not exists (
      select 1 from public.container
       where id = v_container and standort_id = v_stopp.standort_id
    ) then
      continue;
    end if;

    -- Bereits erfasst? Dann war es ein Nachsendeversuch - ueberspringen.
    if exists (
      select 1 from public.tour_container
       where stopp_id = p_stopp_id and container_id = v_container
    ) then
      continue;
    end if;

    v_leerung := null;

    if v_geleert then
      select fuellstand_prozent into v_vorher
        from public.container_zustand where container_id = v_container;

      insert into public.leerung (container_id, geleert_am, fuellstand_vorher,
                                  art, erfasst_von, menge_kg, notiz)
      values (v_container, now(), v_vorher, 'manuell', auth.uid(), v_menge,
              'Auf Tour erfasst.')
      returning id into v_leerung;
    elsif v_grund is not null then
      -- Nicht geleert: das ist eine Meldung wert, sonst faellt es der
      -- Disposition erst beim naechsten Vollalarm auf.
      insert into public.meldung (container_id, typ, text, gemeldet_von, quelle)
      values (v_container, 'sonstiges', v_grund, auth.uid(), 'intern');
    end if;

    insert into public.tour_container (stopp_id, container_id, geleert, grund,
                                       menge_kg, leerung_id, erfasst_von)
    values (p_stopp_id, v_container, v_geleert, v_grund, v_menge, v_leerung, auth.uid());

    v_anzahl := v_anzahl + 1;
  end loop;

  -- Den Stopp selbst nur beim ersten Mal fortschreiben.
  if v_stopp.status = 'offen' then
    update public.tour_stopp
       set status       = p_status,
           erledigt_am  = now(),
           erledigt_von = auth.uid(),
           notiz        = coalesce(p_notiz, notiz)
     where id = p_stopp_id;
  end if;

  return jsonb_build_object('ok', true, 'erfasst', v_anzahl);
end;
$$;

comment on function public.tour_stopp_abschliessen is
  'Schliesst einen Stopp ab und erfasst je Container, ob geleert wurde. Wiederholbar - dieselbe Bestaetigung zweimal erzeugt keine zweite Leerung.';

-- Tour beenden.
create or replace function public.tour_abschliessen(
  p_tour_id uuid,
  p_abgebrochen boolean default false,
  p_bemerkung text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v public.tour%rowtype;
begin
  select * into v from public.tour where id = p_tour_id;
  if not found then
    raise exception 'Tour % gibt es nicht.', p_tour_id;
  end if;

  if v.fahrer_id is distinct from auth.uid() and not public.ist_mindestens_dispo() then
    raise exception 'Diese Tour ist Ihnen nicht zugewiesen.';
  end if;

  if v.status in ('abgeschlossen', 'abgebrochen') then
    return;
  end if;

  update public.tour
     set status           = case when p_abgebrochen then 'abgebrochen' else 'abgeschlossen' end::public.tourstatus,
         abgeschlossen_am = now(),
         -- Eine Tour, die nie gestartet wurde, aber abgeschlossen wird, braucht
         -- trotzdem einen Beginn - die Pruefbedingung verlangt ihn.
         begonnen_am      = coalesce(begonnen_am, now()),
         bemerkung        = coalesce(p_bemerkung, bemerkung)
   where id = p_tour_id;
end;
$$;

comment on function public.tour_abschliessen is
  'Beendet eine Tour, wahlweise als abgeschlossen oder abgebrochen. Mehrfachaufruf ist unschaedlich.';

-- ---------------------------------------------------------------------------
-- Zugriffsregeln
--
-- Die Disposition plant, das Fahrpersonal fuehrt aus. Deshalb zwei Ebenen:
-- pflegen darf die Disposition, fortschreiben darf zusaetzlich der Fahrer,
-- dem die Tour zugewiesen ist - und nur seine eigene.
-- ---------------------------------------------------------------------------
alter table public.tour           enable row level security;
alter table public.tour_stopp     enable row level security;
alter table public.tour_container enable row level security;

-- Hilfspraedikat: gehoert diese Tour dem Aufrufer?
create or replace function public.ist_meine_tour(p_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tour
     where id = p_tour_id and fahrer_id = auth.uid()
  );
$$;

comment on function public.ist_meine_tour is
  'Wahr, wenn die Tour dem angemeldeten Fahrpersonal zugewiesen ist. Praedikat der Zugriffsregeln.';

-- tour
create policy "touren lesen" on public.tour
  for select to authenticated using (public.ist_angemeldet());

create policy "touren pflegen" on public.tour
  for all to authenticated
  using (public.ist_mindestens_dispo()) with check (public.ist_mindestens_dispo());

-- Der Fahrer darf seine eigene Tour fortschreiben (Beginn, Abschluss). Dass
-- er sie sich dabei nicht selbst entziehen oder zuschanzen kann, sichert die
-- with-check-Bedingung: der Fahrer muss er selbst bleiben.
create policy "eigene tour fortschreiben" on public.tour
  for update to authenticated
  using (fahrer_id = auth.uid())
  with check (fahrer_id = auth.uid());

-- tour_stopp
create policy "tourstopps lesen" on public.tour_stopp
  for select to authenticated using (public.ist_angemeldet());

create policy "tourstopps pflegen" on public.tour_stopp
  for all to authenticated
  using (public.ist_mindestens_dispo()) with check (public.ist_mindestens_dispo());

create policy "eigene tourstopps fortschreiben" on public.tour_stopp
  for update to authenticated
  using (public.ist_meine_tour(tour_id))
  with check (public.ist_meine_tour(tour_id));

-- tour_container
create policy "tourcontainer lesen" on public.tour_container
  for select to authenticated using (public.ist_angemeldet());

create policy "tourcontainer pflegen" on public.tour_container
  for all to authenticated
  using (public.ist_mindestens_dispo()) with check (public.ist_mindestens_dispo());

create policy "eigene tourcontainer erfassen" on public.tour_container
  for insert to authenticated
  with check (
    public.ist_meine_tour((select tour_id from public.tour_stopp where id = stopp_id))
  );

grant select, insert, update, delete on public.tour           to authenticated;
grant select, insert, update, delete on public.tour_stopp     to authenticated;
grant select, insert, update, delete on public.tour_container to authenticated;

revoke all on public.tour_fortschritt from public, anon;
grant select on public.tour_fortschritt to authenticated;


revoke execute on function public.tour_aus_route(uuid, date, uuid)          from public, anon, authenticated;
revoke execute on function public.tour_starten(uuid)                        from public, anon, authenticated;
revoke execute on function public.tour_abschliessen(uuid, boolean, text)    from public, anon, authenticated;
revoke execute on function public.ist_meine_tour(uuid)                      from public, anon, authenticated;
revoke execute on function public.tour_stopp_abschliessen(uuid, jsonb, text, public.stoppstatus)
  from public, anon, authenticated;

grant execute on function public.tour_aus_route(uuid, date, uuid)           to authenticated;
grant execute on function public.tour_starten(uuid)                         to authenticated;
grant execute on function public.tour_abschliessen(uuid, boolean, text)     to authenticated;
-- Steht in den Zugriffsregeln selbst - ohne EXECUTE scheitert jede Abfrage.
grant execute on function public.ist_meine_tour(uuid)                       to authenticated;
grant execute on function public.tour_stopp_abschliessen(uuid, jsonb, text, public.stoppstatus)
  to authenticated;
