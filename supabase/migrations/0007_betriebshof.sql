-- ============================================================================
-- 0007_betriebshof.sql
--
-- Fester Ausgangspunkt für die Tourenplanung.
--
-- Ohne Startpunkt beginnt die Route beim ersten Container - das genügt, wenn
-- das Fahrpersonal unterwegs den eigenen Standort verwendet. Wer die Tour
-- schon am Vorabend vom Schreibtisch aus planen will, braucht dagegen einen
-- festen Punkt.
--
-- Eintragen (Koordinaten z. B. aus Google Maps, Rechtsklick auf den Ort):
--   update public.einstellung
--      set wert = '{"name": "Betriebshof Miltenberg", "lat": 49.7042, "lng": 9.2646}'::jsonb
--    where schluessel = 'betriebshof';
--
-- Wieder abschalten:
--   update public.einstellung set wert = 'null'::jsonb where schluessel = 'betriebshof';
-- ============================================================================

insert into public.einstellung (schluessel, wert, beschreibung)
values (
  'betriebshof',
  'null'::jsonb,
  'Fester Startpunkt der Tour: {"name": …, "lat": …, "lng": …} oder null.'
)
on conflict (schluessel) do nothing;
