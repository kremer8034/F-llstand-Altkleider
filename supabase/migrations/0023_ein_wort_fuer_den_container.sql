-- ============================================================================
-- 0023_ein_wort_fuer_den_container.sql
--
-- Ein Wort, nicht zwei.
--
-- 0022 hat in neuen Texten "Behaelter" eingefuehrt, waehrend der Bestand
-- "Container" sagte - und dabei standen beide Woerter auf derselben Seite
-- untereinander. Im Haus heisst das Ding Container, die Tabelle heisst so, die
-- Nummern auf den Aufklebern auch. Also Container, ueberall.
--
-- Die Ansicht aus 0022 zieht mit. Ein Name, der von der Oberflaeche abweicht,
-- ist kein Schoenheitsfehler: er kostet beim naechsten Lesen genau die Sekunde,
-- in der man sich fragt, ob es zwei verschiedene Dinge sind.
-- ============================================================================

alter view if exists public.oeffentlicher_behaelter rename to oeffentlicher_container;

comment on view public.oeffentlicher_container is
  'Zuordnung Containernummer -> Platz fuer die Seite hinter dem QR-Code. Ohne Messwerte.';

grant select on public.oeffentlicher_container to anon, authenticated;
