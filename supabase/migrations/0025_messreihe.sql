-- ============================================================================
-- 0025_messreihe.sql
--
-- Eine Messreihe fuer die Verlaufskurven auf der Containerseite.
--
-- Bis hierher hat die Seite die Rohmessungen selbst geholt: 30 Tage,
-- aufsteigend sortiert, "limit 500". Das war zu der Zeit gedacht, als ein
-- Geraet viermal am Tag meldete - 30 Tage waren dann 120 Zeilen. Der EM400
-- meldet im Minutentakt; 500 aufsteigend sortierte Zeilen sind davon die
-- AELTESTEN acht Stunden des Fensters. Die Kurve endete also weit vor heute,
-- und je laenger der Zeitraum, desto frueher.
--
-- Deshalb faellt die Auswahl jetzt in die Datenbank: das Fenster wird in eine
-- feste Zahl gleich breiter Koerbe geteilt, je Korb ein Mittelwert. Die
-- Datenmenge haengt damit an der Breite der Kurve, nicht mehr an Sendetakt
-- und Zeitraum - ein Jahr im Minutentakt (rund 500.000 Zeilen) kommt genauso
-- als eine Handvoll Punkte an wie sieben Tage.
--
-- Fuellstand und Batterie kommen aus einer Abfrage, weil beide Kurven
-- dieselbe Zeitachse zeigen. Nach "gueltig" wird bewusst NICHT gefiltert:
-- eine unbrauchbare Abstandsmessung setzt den Fuellstand ohnehin auf NULL
-- (0009), ihr Batteriewert ist aber in Ordnung und soll die Batteriekurve
-- nicht loechrig machen. avg() uebergeht NULL von sich aus.
-- ============================================================================

create or replace function public.messreihe(
  p_container_id uuid,
  p_von          timestamptz,
  p_bis          timestamptz default now(),
  p_punkte       integer     default 400
)
returns table (
  zeit               timestamptz,
  fuellstand_prozent smallint,
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
      m.batterie_v
    from korbbreite k
    join public.messung m
      on m.container_id = p_container_id
     and m.gemessen_am >= k.von
     and m.gemessen_am <= k.bis
  )
  select
    e.korb,
    round(avg(e.fuellstand_prozent))::smallint,
    round(avg(e.batterie_prozent))::smallint,
    round(avg(e.batterie_v), 2)::numeric(4, 2),
    count(*)::integer
  from eingeteilt e
  group by e.korb
  order by e.korb;
$$;

comment on function public.messreihe(uuid, timestamptz, timestamptz, integer) is
  'Messungen eines Containers, auf p_punkte gleich breite Zeitkoerbe gemittelt.';

-- Kein SECURITY DEFINER: die Funktion liest nur public.messung, und deren
-- eigene Zugriffsregel ("messungen lesen", angemeldet) greift dadurch weiter.
-- EXECUTE geht bei jeder neuen Funktion automatisch an PUBLIC - siehe 0005.
revoke execute on function public.messreihe(uuid, timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.messreihe(uuid, timestamptz, timestamptz, integer)
  to authenticated;
