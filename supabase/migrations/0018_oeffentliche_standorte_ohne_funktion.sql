-- ============================================================================
-- 0018_oeffentliche_standorte_ohne_funktion.sql
--
-- oeffentliche_standorte lieferte ueber die REST-Schnittstelle nichts.
--
-- Die Ansicht rief intern public.einstellung_zahl() auf, um das
-- Ersatzvolumen zu holen. Migration 0005 hat die Ausfuehrungsrechte dieser
-- Funktion bewusst entzogen und nur an `authenticated` vergeben - sie war
-- ueber /rest/v1/rpc frei aufrufbar gewesen.
--
-- Der Haken: bei einer Ansicht mit security_invoker = false werden die
-- TABELLENrechte gegen den Eigentuemer geprueft, die AUSFUEHRUNGSrechte von
-- Funktionen aber gegen die aufrufende Rolle. Fuer anon scheiterte die
-- Abfrage deshalb mit "permission denied for function einstellung_zahl" -
-- die Karte hinter dem QR-Code blieb leer, ohne dass jemand einen Fehler sah.
--
-- Deshalb hier dasselbe Muster, das oeffentliche_container schon benutzt:
-- die Einstellung per Unterabfrage lesen statt ueber die Funktion. Die
-- Tabelle darf die Ansicht als Eigentuemerin lesen, die Funktion nicht.
--
-- Kein Rechteschraeubchen wird gelockert: einstellung_zahl bleibt fuer anon
-- gesperrt.
-- ============================================================================

create or replace view public.oeffentliche_standorte
with (security_invoker = false)
as
with sichtbar as (
  select
    c.standort_id,
    c.id                                   as container_id,
    -- Ersatzvolumen als Unterabfrage, nicht ueber einstellung_zahl():
    -- siehe Kopf dieser Datei.
    coalesce(
      c.volumen_liter,
      (select (wert #>> '{}')::numeric
         from public.einstellung
        where schluessel = 'standard_volumen_liter'),
      2500
    )                                      as volumen,
    gerundet.wert                          as fuellstand,
    z.gemessen_am
  from public.container c
  left join public.container_zustand z on z.container_id = c.id
  cross join lateral (
    select case
      when z.fuellstand_prozent is null then null
      else least(100, ceil(z.fuellstand_prozent / 10.0) * 10)::smallint
    end as wert
  ) gerundet
  where c.oeffentlich
    and c.status = 'aktiv'
    and c.standort_id is not null
)
select
  st.id                                  as standort_id,
  st.name,
  st.strasse,
  st.plz,
  st.ort,
  st.lat,
  st.lng,
  count(s.container_id)::integer         as container_gesamt,
  count(*) filter (
    where s.fuellstand is null or s.fuellstand < 90
  )::integer                             as container_mit_platz,
  round((sum(s.volumen * (100 - coalesce(s.fuellstand, 0)) / 100.0)
         / nullif(sum(s.volumen), 0) * 100)::numeric, 0) as freie_prozent,
  public.fuellstand_stufe(min(s.fuellstand)::smallint) as stufe,
  max(s.gemessen_am)                     as gemessen_am,
  case when max(s.gemessen_am) is null then null
       else round(extract(epoch from (now() - max(s.gemessen_am))) / 3600.0, 1)
  end                                    as stunden_seit_messung
from public.standort st
join sichtbar s on s.standort_id = st.id
where st.aktiv
  and st.lat is not null
  and st.lng is not null
  and coalesce((select (wert #>> '{}')::boolean from public.einstellung where schluessel = 'oeffentliche_karte'), true)
group by st.id, st.name, st.strasse, st.plz, st.ort, st.lat, st.lng;

comment on view public.oeffentliche_standorte is
  'Oeffentliche Platzliste: ein Eintrag je Standort mit freier Kapazitaet und Zahl der Container, die noch aufnehmen. Grundlage der Karte und der Seite hinter dem QR-Code.';

grant select on public.oeffentliche_standorte to anon, authenticated;
