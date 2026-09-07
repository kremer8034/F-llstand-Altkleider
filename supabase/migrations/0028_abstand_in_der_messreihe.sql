-- ============================================================================
-- 0028_abstand_in_der_messreihe.sql
--
-- Der gemessene Abstand gehoert in die Verlaufstabelle.
--
-- Anlass ist eine Frage vom 07.09.2026, die sich mit der bisherigen Anzeige
-- nicht beantworten liess: "warum steht der Container auf 100 %, der Sensor
-- misst doch rund zwei Meter?" Die Tabelle zeigte Zeitpunkt, Fuellstand und
-- Batterie - also das Ergebnis der Rechnung, aber nicht ihre Eingangsgroesse.
-- Wer wissen will, ob ein unerwarteter Fuellstand vom Sensor kommt oder von
-- der Kalibrierung, musste in die Datenbank sehen. (Er kam vom Sensor: das
-- Geraet meldete 328 mm, nicht 2000.)
--
-- Deshalb liefert die Messreihe den Abstand jetzt mit. Zwei Feinheiten:
--
--   * Gemittelt wird nur ueber GUELTIGE Messungen. Der Fuellstand ist bei
--     einer unbrauchbaren Messung ohnehin NULL, der Abstand aber steht drin -
--     und er steht dort als 65533 ("nichts im Messbereich", siehe 0027). Ein
--     einziger solcher Wert wuerde den Mittelwert eines ganzen Korbes
--     unbrauchbar machen.
--
--   * Der Rueckgabetyp aendert sich, deshalb "drop" statt "create or replace":
--     PostgreSQL laesst eine Funktion nicht mit veraenderter Spaltenliste
--     ersetzen. Rechte muessen danach neu gesetzt werden - sie haengen an der
--     Funktion, nicht am Namen.
-- ============================================================================

drop function if exists public.messreihe(uuid, timestamptz, timestamptz, integer);

create function public.messreihe(
  p_container_id uuid,
  p_von          timestamptz,
  p_bis          timestamptz default now(),
  p_punkte       integer     default 400
)
returns table (
  zeit               timestamptz,
  fuellstand_prozent smallint,
  abstand_mm         integer,
  batterie_prozent   smallint,
  batterie_v         numeric(4, 2),
  messungen          integer
)
language sql
stable
set search_path = public
as $$
  with rahmen as (
    select
      p_von                                          as von,
      greatest(p_bis, p_von + interval '1 minute')   as bis,
      greatest(10, least(2000, coalesce(p_punkte, 400))) as punkte
  ),
  korbbreite as (
    -- Sekunden je Korb. Nie 0, weil "bis" oben mindestens eine Minute
    -- hinter "von" liegt.
    select r.*, extract(epoch from (r.bis - r.von)) / r.punkte as sekunden
    from rahmen r
  ),
  eingeteilt as (
    select
      k.von + (floor(extract(epoch from (m.gemessen_am - k.von)) / k.sekunden)
               * k.sekunden) * interval '1 second' as korb,
      m.fuellstand_prozent,
      m.batterie_prozent,
      m.batterie_v,
      case when m.gueltig then m.abstand_mm end as abstand_mm
    from korbbreite k
    join public.messung m
      on m.container_id = p_container_id
     and m.gemessen_am >= k.von
     and m.gemessen_am <= k.bis
  )
  select
    e.korb,
    round(avg(e.fuellstand_prozent))::smallint,
    round(avg(e.abstand_mm))::integer,
    round(avg(e.batterie_prozent))::smallint,
    round(avg(e.batterie_v), 2)::numeric(4, 2),
    count(*)::integer
  from eingeteilt e
  group by e.korb
  order by e.korb;
$$;

comment on function public.messreihe(uuid, timestamptz, timestamptz, integer) is
  'Messungen eines Containers, auf p_punkte gleich breite Zeitkoerbe gemittelt. '
  'Der Abstand nur aus gueltigen Messungen - siehe 0028.';

-- Wie in 0025: kein SECURITY DEFINER, und EXECUTE bekommt nur, wer angemeldet
-- ist (Begruendung in 0005_funktionsrechte.sql).
revoke execute on function public.messreihe(uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.messreihe(uuid, timestamptz, timestamptz, integer)
  to authenticated;
