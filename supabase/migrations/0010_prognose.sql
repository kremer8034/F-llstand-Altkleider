-- ============================================================================
-- 0010_prognose.sql
--
-- Zwei neue Auswertungen und eine vorausschauende Tourenliste:
--
--   a) container_rhythmus  - wie oft ein Container geleert wird (Kennzahl)
--   b) container_prognose  - wann er voraussichtlich wieder geleert werden muss
--   c) tourenliste()       - nimmt jetzt auch auf, was demnaechst faellig wird
--
-- Beide Ansichten sind reine Auswertungen: sie schreiben nichts und speichern
-- nichts. Damit bleibt jede Zahl jederzeit aus den Rohdaten nachvollziehbar,
-- und eine geloeschte oder korrigierte Leerung wirkt sofort.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Einstellungen
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung) values
  ('leerung_min_abstand_stunden', '12',
   'Zwei Leerungen dichter beieinander gelten als Korrektur und zaehlen nicht als Abstand.'),
  ('tour_vorlauf_tage', '3',
   'So viele Tage im Voraus nimmt die Tourenliste einen Container auf, den die Prognose faellig meldet.')
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- a) Leerungsrhythmus je Container
--
-- Die Kennzahl ist der arithmetische Mittelwert der Abstaende zwischen zwei
-- aufeinanderfolgenden Leerungen DESSELBEN Containers. Streuung, kuerzester
-- und laengster Abstand stehen daneben, weil ein Mittelwert allein nicht
-- verraet, ob er verlaesslich ist: 14 Tage aus 13/14/15 sind etwas anderes
-- als 14 Tage aus 3/25.
--
-- Sehr kurze Abstaende werden ausgesondert. Wird eine Leerung von Hand
-- nachgetragen, die der Sensor schon selbst erkannt hat, stehen zwei Eintraege
-- kurz hintereinander - ohne diese Grenze wuerde der Mittelwert einbrechen.
-- ---------------------------------------------------------------------------
create or replace view public.container_rhythmus
with (security_invoker = true) as
with abstaende as (
  select
    l.container_id,
    l.geleert_am,
    extract(epoch from (
      l.geleert_am - lag(l.geleert_am) over (partition by l.container_id order by l.geleert_am)
    )) / 86400.0 as tage
  from public.leerung l
),
grenze as (
  select public.einstellung_zahl('leerung_min_abstand_stunden', 12) / 24.0 as min_tage
),
je_container as (
  select
    a.container_id,
    count(*)                                                as leerungen_gesamt,
    min(a.geleert_am)                                       as erste_leerung_am,
    max(a.geleert_am)                                       as letzte_leerung_am,
    count(a.tage)       filter (where a.tage >= g.min_tage) as abstaende_anzahl,
    avg(a.tage)         filter (where a.tage >= g.min_tage) as mittel_tage,
    stddev_samp(a.tage) filter (where a.tage >= g.min_tage) as streuung_tage,
    min(a.tage)         filter (where a.tage >= g.min_tage) as kuerzester_tage,
    max(a.tage)         filter (where a.tage >= g.min_tage) as laengster_tage
  from abstaende a cross join grenze g
  group by a.container_id
)
select
  c.id                                     as container_id,
  c.nummer,
  coalesce(j.leerungen_gesamt, 0)::integer as leerungen_gesamt,
  coalesce(j.abstaende_anzahl, 0)::integer as abstaende_anzahl,
  j.erste_leerung_am,
  j.letzte_leerung_am,
  case when j.letzte_leerung_am is null then null
       else round((extract(epoch from (now() - j.letzte_leerung_am)) / 86400.0)::numeric, 1)
  end                                      as tage_seit_letzter_leerung,
  round(j.mittel_tage::numeric, 1)         as mittel_tage,
  round(j.streuung_tage::numeric, 1)       as streuung_tage,
  round(j.kuerzester_tage::numeric, 1)     as kuerzester_abstand_tage,
  round(j.laengster_tage::numeric, 1)      as laengster_abstand_tage,
  case when j.mittel_tage > 0 then round((365.25 / j.mittel_tage)::numeric, 1) end as leerungen_pro_jahr
from public.container c
left join je_container j on j.container_id = c.id;

comment on view public.container_rhythmus is
  'Leerungsrhythmus je Container: mittlerer Abstand zwischen zwei Leerungen desselben Containers, Streuung und Hochrechnung auf ein Jahr.';

-- ---------------------------------------------------------------------------
-- b) Prognose: wann wird der Container wieder faellig?
--
-- Zwei Quellen, beide sichtbar, damit die Zahl nachvollziehbar bleibt:
--
--   rate_messung  Anstieg des Fuellstands im LAUFENDEN Zyklus, also seit der
--                 letzten Leerung - lineare Regression ueber die Messpunkte.
--                 Das ist das lebende Signal, aber am Anfang eines Zyklus
--                 stehen dafuer zu wenige Punkte.
--   rate_historie Anstieg, der sich aus dem bisherigen Rhythmus ergibt:
--                 100 Prozentpunkte verteilt auf den mittleren Abstand.
--
-- Gemischt wird nach Datenlage: das Gewicht der Messung waechst mit der Zahl
-- der Tage, die der laufende Zyklus schon dauert (bis zu sieben), das Gewicht
-- der Historie mit der Zahl der gezaehlten Abstaende (bis zu vier). Nach einer
-- Woche Messung traegt also die Messung, davor die Erfahrung.
--
-- Bewusst NICHT gerechnet wird ein Wochentagsmuster: dafuer braucht es
-- Monate an Daten. Kommt es spaeter dazu, ist die Stelle hier.
-- ---------------------------------------------------------------------------
create or replace view public.container_prognose
with (security_invoker = true) as
with schwellen as (
  select public.einstellung_zahl('schwelle_warnung', 75) as tour,
         public.einstellung_zahl('schwelle_voll', 90)    as voll
),
zyklus as (
  select
    m.container_id,
    count(*)                                                                  as punkte,
    extract(epoch from (max(m.gemessen_am) - min(m.gemessen_am))) / 86400.0   as spanne_tage,
    regr_slope(m.fuellstand_prozent, extract(epoch from m.gemessen_am) / 86400.0) as steigung
  from public.messung m
  left join public.container_rhythmus r on r.container_id = m.container_id
  where m.gueltig
    and m.fuellstand_prozent is not null
    and m.gemessen_am > now() - interval '60 days'
    and m.gemessen_am > coalesce(r.letzte_leerung_am, now() - interval '60 days')
  group by m.container_id
)
select
  c.id            as container_id,
  c.nummer,
  z.fuellstand_prozent,
  z.gemessen_am,
  roh.rm          as rate_messung,
  roh.rh          as rate_historie,
  round(misch.rate::numeric, 2) as rate_prozent_pro_tag,
  round(t.tage_bis_tour::numeric, 1) as tage_bis_tour,
  round(t.tage_bis_voll::numeric, 1) as tage_bis_voll,
  case when t.tage_bis_tour is null then null else now() + (t.tage_bis_tour * interval '1 day') end as prognose_tour_am,
  case when t.tage_bis_voll is null then null else now() + (t.tage_bis_voll * interval '1 day') end as prognose_voll_am,
  case
    when roh.rm is not null and roh.rh is not null then 'messung_und_historie'
    when roh.rm is not null                        then 'messung'
    when roh.rh is not null                        then 'historie'
    else 'keine'
  end             as grundlage
from public.container c
cross join schwellen s
left join public.container_zustand z on z.container_id = c.id
left join public.container_rhythmus r on r.container_id = c.id
left join zyklus y on y.container_id = c.id
cross join lateral (
  select
    -- Vier Punkte ueber mindestens einen Tag, und der Fuellstand muss steigen.
    -- Ein fallender Anstieg heisst: gerade geleert oder Messfehler - daraus
    -- laesst sich nichts hochrechnen.
    case when y.punkte >= 4 and y.spanne_tage >= 1 and y.steigung > 0
         then round(y.steigung::numeric, 2) end as rm,
    case when r.mittel_tage > 0
         then round((100.0 / r.mittel_tage)::numeric, 2) end as rh
) roh
cross join lateral (
  select
    least(coalesce(y.spanne_tage, 0), 7)::numeric        as wm,
    least(coalesce(r.abstaende_anzahl, 0), 4)::numeric   as wh
) gew
cross join lateral (
  select case
    when roh.rm is not null and roh.rh is not null and (gew.wm + gew.wh) > 0
      then (roh.rm * gew.wm + roh.rh * gew.wh) / (gew.wm + gew.wh)
    when roh.rm is not null then roh.rm
    when roh.rh is not null then roh.rh
  end as rate
) misch
cross join lateral (
  select
    case when misch.rate > 0 and z.fuellstand_prozent is not null
         then greatest(0, (s.tour - z.fuellstand_prozent) / misch.rate) end as tage_bis_tour,
    case when misch.rate > 0 and z.fuellstand_prozent is not null
         then greatest(0, (s.voll - z.fuellstand_prozent) / misch.rate) end as tage_bis_voll
) t;

comment on view public.container_prognose is
  'Hochrechnung, wann ein Container die Tourenschwelle und die Vollschwelle erreicht - aus dem Anstieg im laufenden Zyklus und dem bisherigen Leerungsrhythmus.';

-- ---------------------------------------------------------------------------
-- c) Tourenliste: zusaetzlich, was in den naechsten Tagen faellig wird
--
-- Die Spaltenliste waechst, deshalb erst loeschen. Rechte werden unten neu
-- gesetzt - PostgreSQL vergibt EXECUTE sonst automatisch an PUBLIC, und die
-- Funktion gaebe ohne Anmeldung Standorte und Fuellstaende preis (siehe 0005).
-- ---------------------------------------------------------------------------
drop function if exists public.tourenliste(smallint);

create or replace function public.tourenliste(
  p_schwelle     smallint default null,
  p_vorlauf_tage numeric  default null
)
returns table (
  container_id         uuid,
  nummer               text,
  bezeichnung          text,
  strasse              text,
  plz                  text,
  ort                  text,
  lat                  double precision,
  lng                  double precision,
  fuellstand_prozent   smallint,
  gemessen_am          timestamptz,
  stunden_seit_messung numeric,
  offene_meldungen     bigint,
  prioritaet           numeric,
  grund                text,
  tage_bis_tour        numeric,
  prognose_tour_am     timestamptz,
  prognose_voll_am     timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with schwelle as (
    select coalesce(p_schwelle, public.einstellung_zahl('schwelle_warnung', 75))::numeric as wert
  ),
  vorlauf as (
    select coalesce(p_vorlauf_tage, public.einstellung_zahl('tour_vorlauf_tage', 3))::numeric as tage
  )
  select
    c.id,
    c.nummer,
    c.bezeichnung,
    c.strasse,
    c.plz,
    c.ort,
    c.lat,
    c.lng,
    z.fuellstand_prozent,
    z.gemessen_am,
    round(extract(epoch from (now() - z.gemessen_am)) / 3600.0, 1) as stunden_seit_messung,
    (select count(*) from public.meldung m
      where m.container_id = c.id and m.erledigt_am is null) as offene_meldungen,
    -- Prioritaet: Fuellstand plus Zuschlag fuer offene Meldungen und Standzeit.
    -- Ein nur vorhergesagter Container hat naturgemaess einen niedrigeren
    -- Fuellstand und sortiert sich damit von selbst hinter die faelligen.
    coalesce(z.fuellstand_prozent, 0)
      + (select count(*) * 10 from public.meldung m
          where m.container_id = c.id and m.erledigt_am is null)
      + least(10, extract(epoch from (now() - coalesce(z.gemessen_am, now()))) / 86400.0) as prioritaet,
    case
      when z.fuellstand_prozent >= s.wert then 'fuellstand'
      when exists (select 1 from public.meldung m
                    where m.container_id = c.id and m.erledigt_am is null) then 'meldung'
      else 'prognose'
    end as grund,
    p.tage_bis_tour,
    p.prognose_tour_am,
    p.prognose_voll_am
  from public.container c
  left join public.container_zustand z on z.container_id = c.id
  left join public.container_prognose p on p.container_id = c.id
  cross join schwelle s
  cross join vorlauf v
  where c.status = 'aktiv'
    and (
      z.fuellstand_prozent >= s.wert
      or exists (select 1 from public.meldung m
                  where m.container_id = c.id and m.erledigt_am is null)
      or (p.tage_bis_tour is not null and p.tage_bis_tour <= v.tage)
    )
  order by prioritaet desc;
$$;

comment on function public.tourenliste is
  'Container, die angefahren werden sollten: ueber der Schwelle, mit offener Meldung, oder laut Prognose in den naechsten Tagen faellig.';

-- ---------------------------------------------------------------------------
-- Rechte
--
-- Beide Ansichten zeigen Betriebsdaten und gehen deshalb NICHT an anon - im
-- Unterschied zu oeffentliche_container. security_invoker sorgt zusaetzlich
-- dafuer, dass die Zugriffsregeln der Rohtabellen greifen.
-- ---------------------------------------------------------------------------
revoke all on public.container_rhythmus from public, anon;
revoke all on public.container_prognose from public, anon;
grant select on public.container_rhythmus to authenticated;
grant select on public.container_prognose to authenticated;

revoke execute on function public.tourenliste(smallint, numeric) from public, anon, authenticated;
grant  execute on function public.tourenliste(smallint, numeric) to authenticated;
