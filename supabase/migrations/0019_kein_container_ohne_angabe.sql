-- ============================================================================
-- 0019_kein_container_ohne_angabe.sql
--
-- Kein Container darf einen Stopp verlassen, ohne dass jemand gesagt hat,
-- was mit ihm geschehen ist.
--
-- Die Fahreransicht verlangt das jetzt: jeder Container muss angetippt
-- werden, der Knopf bleibt bis dahin gesperrt. Eine Luecke bleibt trotzdem,
-- und die kann die Oberflaeche nicht schliessen:
--
--   Der Fahrer laedt die Tour, faehrt ins Funkloch. Die Disposition stellt
--   in der Zwischenzeit einen zweiten Container an denselben Platz. Das
--   Geraet des Fahrers weiss davon nichts, er bestaetigt seinen einen
--   Container - und der zweite taucht in keiner Zeile auf. Nicht als
--   "geleert", nicht als "stehen geblieben", sondern gar nicht.
--
-- Ihn deswegen abzuweisen waere falsch: dann steht das Fahrpersonal im Regen
-- vor einem Knopf, der nicht funktioniert, und die Warteschlange versucht es
-- bis in alle Ewigkeit. Stattdessen wird der fehlende Container ausdruecklich
-- als "nicht erfasst" vermerkt.
--
-- Damit gilt durchgaengig: zu jedem abgeschlossenen Stopp gibt es fuer jeden
-- Container eine Zeile. Entweder eine Leerung, oder ein Grund, oder der
-- Vermerk, dass niemand etwas gesagt hat. Das Letzte ist unschoen - aber es
-- ist sichtbar, und darauf kommt es an.
-- ============================================================================

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
  v_nachtrag  integer := 0;
begin
  select * into v_stopp from public.tour_stopp where id = p_stopp_id;
  if not found then
    raise exception 'Stopp % gibt es nicht.', p_stopp_id;
  end if;

  select * into v_tour from public.tour where id = v_stopp.tour_id;

  if v_tour.fahrer_id is distinct from auth.uid() and not public.ist_mindestens_dispo() then
    raise exception 'Diese Tour ist Ihnen nicht zugewiesen.';
  end if;

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

    if not exists (
      select 1 from public.container
       where id = v_container and standort_id = v_stopp.standort_id
    ) then
      continue;
    end if;

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
    -- Nachtrag: aktive Container am Platz, zu denen nichts kam. Sie bekommen
    -- eine Zeile mit "nicht erfasst", damit der Stopp keinen blinden Fleck
    -- hinterlaesst. Eine Leerung entsteht dabei ausdruecklich NICHT.
    insert into public.tour_container (stopp_id, container_id, geleert, grund, erfasst_von)
    select p_stopp_id, c.id, false,
           'Nicht erfasst - stand beim Abschluss nicht auf dem Geraet.',
           auth.uid()
      from public.container c
     where c.standort_id = v_stopp.standort_id
       and c.status = 'aktiv'
       and not exists (
         select 1 from public.tour_container tc
          where tc.stopp_id = p_stopp_id and tc.container_id = c.id
       );

    get diagnostics v_nachtrag = row_count;

    update public.tour_stopp
       set status       = p_status,
           erledigt_am  = now(),
           erledigt_von = auth.uid(),
           notiz        = coalesce(p_notiz, notiz)
     where id = p_stopp_id;
  end if;

  return jsonb_build_object('ok', true, 'erfasst', v_anzahl, 'nachgetragen', v_nachtrag);
end;
$$;

comment on function public.tour_stopp_abschliessen is
  'Schliesst einen Stopp ab und erfasst je Container, ob geleert wurde. Wiederholbar. Container, zu denen nichts kam, werden als "nicht erfasst" vermerkt - kein Stopp hinterlaesst einen blinden Fleck.';
