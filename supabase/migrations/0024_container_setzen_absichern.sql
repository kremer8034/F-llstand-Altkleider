-- ============================================================================
-- 0024_container_setzen_absichern.sql
--
-- Drei Nachbesserungen an standort_container_setzen aus 0022.
--
-- 1) RECHTE. Die Funktion ist `security definer` und umgeht damit genau die
--    Zeilenschutzregel, die 0003 fuer container aufgestellt hat:
--
--        using (public.ist_mindestens_dispo())
--
--    Geprueft hat sie aber nur `ist_angemeldet()`. Damit konnte jede
--    angemeldete Person - auch das Fahrpersonal - ueber /rest/v1/rpc Container
--    anlegen und loeschen, was ihr auf dem normalen Weg verwehrt ist. Das war
--    keine Absicht, sondern uebersehen.
--
-- 2) SORTIERUNG BEIM ABBAU. "Die zuletzt angelegten zuerst" stimmte nur bis
--    neun Containern. Alle in einem Aufruf angelegten teilen sich denselben
--    angelegt_am, und der Rueckfall auf `nummer desc` sortiert als TEXT:
--
--        RKL-9  >  RKL-2  >  RKL-12  >  RKL-10
--
--    Von zwoelf auf zehn verschwanden also RKL-9 und RKL-2 statt RKL-12 und
--    RKL-11. Kein Datenverlust - Container mit Geschichte werden ohnehin nur
--    stillgelegt -, aber die Nummern bekamen Loecher an unerwarteter Stelle.
--    Sortiert wird jetzt nach der Zahl hinter dem Bindestrich.
--
-- 3) GLEICHZEITIGKEIT. Zwei Aufrufe fuer denselben Platz konnten dieselbe
--    freie Nummer finden und der zweite an der Eindeutigkeit scheitern. Ein
--    Sperrvermerk je Platz reiht sie hintereinander. Er gilt bis zum Ende der
--    Transaktion und blockiert nur denselben Platz.
-- ============================================================================

create or replace function public.standort_container_setzen(
  p_standort_id uuid,
  p_anzahl integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kuerzel     text;
  v_aktuell     integer;
  v_neu         integer := 0;
  v_stillgelegt integer := 0;
  v_geloescht   integer := 0;
  v_index       integer;
  v_nummer      text;
  r             record;
begin
  -- Anlegen und Loeschen von Containern ist Sache der Disposition. Ohne diese
  -- Pruefung waere die Funktion ein Weg um den Zeilenschutz herum.
  if not public.ist_mindestens_dispo() then
    raise exception 'Dafuer werden Rechte ab der Disposition gebraucht.'
      using errcode = '42501';
  end if;

  if p_anzahl is null or p_anzahl < 0 or p_anzahl > 50 then
    raise exception 'Anzahl muss zwischen 0 und 50 liegen.' using errcode = 'P0001';
  end if;

  -- Ein Platz nach dem anderen: sonst suchen zwei Aufrufe dieselbe freie
  -- Nummer und der zweite laeuft in die Eindeutigkeitsverletzung.
  perform pg_advisory_xact_lock(hashtext(p_standort_id::text));

  select kuerzel into v_kuerzel from public.standort where id = p_standort_id;
  if not found then
    raise exception 'Standort nicht gefunden.' using errcode = 'P0002';
  end if;

  if v_kuerzel is null then
    select public.standort_kuerzel_vorschlag(name, id) into v_kuerzel
      from public.standort where id = p_standort_id;
    update public.standort set kuerzel = v_kuerzel where id = p_standort_id;
  end if;

  select count(*) into v_aktuell
    from public.container
   where standort_id = p_standort_id and status = 'aktiv';

  -- Aufstocken: naechste freie Nummer suchen, nicht einfach weiterzaehlen -
  -- ein stillgelegter RKL-3 blockiert seine Nummer weiterhin.
  while v_aktuell + v_neu < p_anzahl loop
    v_index := 1;
    loop
      v_nummer := v_kuerzel || '-' || v_index::text;
      exit when not exists (select 1 from public.container where nummer = v_nummer);
      v_index := v_index + 1;
    end loop;

    insert into public.container (nummer, standort_id)
    values (v_nummer, p_standort_id);

    v_neu := v_neu + 1;
  end loop;

  -- Abbauen: die zuletzt angelegten zuerst, damit die eingespielten Container
  -- mit Geschichte moeglichst unberuehrt bleiben. Bei gleichem Zeitstempel
  -- entscheidet die ZAHL hinter dem Bindestrich, nicht die Zeichenkette.
  for r in
    select c.id,
           c.nummer,
           exists (select 1 from public.messung        m where m.container_id = c.id)
        or exists (select 1 from public.leerung        l where l.container_id = c.id)
        or exists (select 1 from public.meldung        g where g.container_id = c.id)
        or exists (select 1 from public.alarm          a where a.container_id = c.id)
        or exists (select 1 from public.tour_container t where t.container_id = c.id)
        or exists (select 1 from public.sensor_kopplung k where k.container_id = c.id)
        or exists (select 1 from public.sensor         s where s.container_id = c.id) as benutzt
      from public.container c
     where c.standort_id = p_standort_id
       and c.status = 'aktiv'
     order by c.angelegt_am desc,
              (case when c.nummer ~ '-[0-9]+$'
                    then (regexp_replace(c.nummer, '^.*-', ''))::bigint
               end) desc nulls last,
              c.nummer desc
     limit greatest(0, v_aktuell - p_anzahl)
  loop
    if r.benutzt then
      update public.container
         set status = 'entfernt', geaendert_am = now()
       where id = r.id;
      v_stillgelegt := v_stillgelegt + 1;
    else
      delete from public.container where id = r.id;
      v_geloescht := v_geloescht + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'standort_id',  p_standort_id,
    'kuerzel',      v_kuerzel,
    'vorher',       v_aktuell,
    'nachher',      (select count(*) from public.container
                      where standort_id = p_standort_id and status = 'aktiv'),
    'angelegt',     v_neu,
    'stillgelegt',  v_stillgelegt,
    'geloescht',    v_geloescht
  );
end;
$$;

comment on function public.standort_container_setzen is
  'Setzt die Zahl aktiver Container an einem Platz. Nur ab Disposition. Legt fehlende an; ueberzaehlige werden stillgelegt, wenn sie Geschichte haben, sonst geloescht.';

revoke all on function public.standort_container_setzen(uuid, integer) from public, anon;
grant execute on function public.standort_container_setzen(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Ausfuehrungsrechte, die beim Umbau verlorengegangen sind
--
-- In PostgreSQL erbt eine Funktion beim Anlegen "execute to PUBLIC". 0005 und
-- 0012 haben das fuer jede Funktion einzeln zurueckgenommen und nur gezielt
-- wieder vergeben. `create or replace` erhaelt diese Rechte - `drop` und
-- `create` NICHT, und eine geaenderte Signatur ist immer ein neues Objekt.
--
-- Genau das ist in 0022 zweimal passiert:
--
--   * container_kalibrieren bekam mit p_einbauhoehe_mm eine neue Signatur.
--     Die Sperre aus 0005 hing an der alten (uuid, integer, integer).
--   * tourenplanung() wurde geloescht und neu angelegt; die Sperre aus 0012
--     ging mit.
--
-- Beide waren danach fuer anon aufrufbar. Ein Schaden entstand nicht - die
-- eine prueft `ist_angemeldet()`, die andere laeuft als security invoker gegen
-- den Zeilenschutz -, aber eine Verteidigungslinie war weg, ohne dass es
-- jemandem auffiel.
--
-- Dazu die beiden Helfer aus 0022, die nie durch dieses Tor gegangen sind.
-- ---------------------------------------------------------------------------
revoke execute on function public.container_kalibrieren(uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.tourenplanung()
  from public, anon, authenticated;
revoke execute on function public.sensor_kalibrierung(uuid)
  from public, anon, authenticated;
revoke execute on function public.standort_kuerzel_vorschlag(text, uuid)
  from public, anon, authenticated;

grant execute on function public.container_kalibrieren(uuid, integer)      to authenticated;
grant execute on function public.tourenplanung()                           to authenticated;
grant execute on function public.standort_kuerzel_vorschlag(text, uuid)    to authenticated;

-- sensor_kalibrierung bleibt ohne Vergabe: sie wird ausschliesslich aus
-- messung_vorbereiten und container_kalibrieren heraus aufgerufen, und beide
-- laufen als security definer mit den Rechten der Eigentuemerin. Von aussen
-- braucht sie niemand.
