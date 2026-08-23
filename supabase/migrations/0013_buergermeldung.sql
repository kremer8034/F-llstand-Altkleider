-- ============================================================================
-- 0013_buergermeldung.sql
--
-- Der QR-Code am Container (docs/tourenplanung.md, Abschnitt 6).
--
-- Zwei Funktionen fuer den Buerger: den naechsten Container mit Platz finden,
-- und melden, dass dieser hier voll ist. Der Standortfinder braucht nichts
-- Neues - die oeffentliche Liste gibt es schon, und sortiert wird im Browser,
-- damit die Position des Buergers das Geraet nicht verlaesst.
--
-- Hier steht nur, was die Meldung braucht:
--   a) Herkunft und Zaehler an der Meldung
--   b) meldung_oeffentlich(): eine Funktion, die anon aufrufen darf
--
-- Kein Freitext, keine Koordinaten, keine Cookies. Es gibt nichts zu
-- moderieren und nichts zu speichern, das Rueckschluesse auf Personen zulaesst.
-- ============================================================================

insert into public.einstellung (schluessel, wert, beschreibung) values
  ('meldung_zusammenfassen_stunden', '6',
   'Weitere Buergermeldungen am selben Container zaehlen innerhalb dieses Fensters hoch, statt neue Eintraege anzulegen.'),
  ('meldung_hoechstzahl', '25',
   'Obergrenze fuer den Zaehler einer offenen Buergermeldung - damit sich die Liste nicht fluten laesst.')
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- a) Herkunft und Zaehler
-- ---------------------------------------------------------------------------
alter table public.meldung
  add column if not exists quelle text not null default 'intern',
  add column if not exists anzahl smallint not null default 1;

alter table public.meldung
  add constraint meldung_quelle_bekannt check (quelle in ('intern', 'oeffentlich'));

comment on column public.meldung.quelle is
  'intern = im geschuetzten Bereich erfasst, oeffentlich = ueber den QR-Code am Container.';
comment on column public.meldung.anzahl is
  'Wie oft dieselbe offene Meldung gemeldet wurde. Bei Buergermeldungen der Zaehler statt vieler Eintraege.';

create index if not exists meldung_offen_idx
  on public.meldung (container_id, quelle)
  where erledigt_am is null;

-- ---------------------------------------------------------------------------
-- b) Die Meldung selbst
--
-- SECURITY DEFINER, weil anon nicht in public.meldung schreiben darf und auch
-- nicht soll: der einzige Weg von aussen ist genau diese Funktion, und sie
-- laesst nur eines zu - "dieser Container ist voll".
--
-- Missbrauchsschutz ohne Erkennungsmerkmal: eine offene Buergermeldung je
-- Container wird hochgezaehlt statt vervielfacht, und der Zaehler hat eine
-- Obergrenze. Wer den Knopf hundertmal drueckt, erzeugt damit hoechstens eine
-- Meldung mit dem Hoechstwert. Eine echte Ratenbegrenzung gehoert davor, an
-- den Webserver - das kann eine Datenbankfunktion nicht leisten.
-- ---------------------------------------------------------------------------
create or replace function public.meldung_oeffentlich(p_container_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fenster  integer := public.einstellung_zahl('meldung_zusammenfassen_stunden', 6)::integer;
  v_hoechst  integer := public.einstellung_zahl('meldung_hoechstzahl', 25)::integer;
  v_container public.container%rowtype;
  v_offen    public.meldung%rowtype;
begin
  select * into v_container
    from public.container
   where id = p_container_id and status = 'aktiv';

  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;

  -- Offene Buergermeldung im Zeitfenster? Dann hochzaehlen statt anlegen.
  select * into v_offen
    from public.meldung
   where container_id = p_container_id
     and quelle = 'oeffentlich'
     and erledigt_am is null
   order by gemeldet_am desc
   limit 1;

  if found then
    if v_offen.gemeldet_am > now() - make_interval(hours => v_fenster) then
      -- Innerhalb des Fensters: nur zaehlen, Zeitstempel unveraendert lassen,
      -- damit sich das Fenster nicht endlos verlaengern laesst.
      update public.meldung
         set anzahl = least(v_hoechst, anzahl + 1)
       where id = v_offen.id;
      return jsonb_build_object('ok', true, 'neu', false, 'anzahl', least(v_hoechst, v_offen.anzahl + 1));
    end if;

    -- Aelter als das Fenster, aber noch offen: ebenfalls nur zaehlen und den
    -- Zeitstempel nachziehen - zwei offene Meldungen am selben Container
    -- helfen niemandem.
    update public.meldung
       set anzahl = least(v_hoechst, anzahl + 1), gemeldet_am = now()
     where id = v_offen.id;
    return jsonb_build_object('ok', true, 'neu', false, 'anzahl', least(v_hoechst, v_offen.anzahl + 1));
  end if;

  insert into public.meldung (container_id, typ, quelle, text)
  values (p_container_id, 'voll', 'oeffentlich', 'Über den QR-Code am Container gemeldet.');

  return jsonb_build_object('ok', true, 'neu', true, 'anzahl', 1);
end;
$$;

comment on function public.meldung_oeffentlich is
  'Buergermeldung "Container ist voll" ueber den QR-Code. Fasst mehrfache Meldungen je Container zusammen und speichert nichts ueber die meldende Person.';

-- ---------------------------------------------------------------------------
-- Rechte: anon darf genau diese eine Funktion, sonst nichts.
-- ---------------------------------------------------------------------------
revoke execute on function public.meldung_oeffentlich(uuid) from public;
grant  execute on function public.meldung_oeffentlich(uuid) to anon, authenticated;
