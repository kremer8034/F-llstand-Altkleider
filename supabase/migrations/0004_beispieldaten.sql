-- ============================================================================
-- 0004_beispieldaten.sql   (OPTIONAL)
--
-- Beispielstandorte im Landkreis Miltenberg, damit Karte und Listen schon vor
-- dem ersten echten Sensor etwas anzeigen. Vor dem Produktivstart einfach
-- weglassen oder die Daten spaeter mit
--   delete from public.container where nummer like 'DEMO-%';
-- wieder entfernen.
-- ============================================================================

insert into public.container
  (nummer, bezeichnung, strasse, plz, ort, lat, lng, volumen_liter,
   leer_abstand_mm, voll_abstand_mm, aufstelldatum, status, oeffentlich)
values
  ('DEMO-001', 'Wertstoffhof',        'Industriestr. 4',  '63897', 'Miltenberg',     49.70420, 9.26460, 2500, 1450, 220, '2023-04-12', 'aktiv', true),
  ('DEMO-002', 'Netto Parkplatz',     'Miltenberger Str. 22', '63920', 'Grossheubach', 49.73330, 9.21670, 2500, 1420, 210, '2024-02-01', 'aktiv', true),
  ('DEMO-003', 'Friedhof Nord',       'Kirchweg 1',       '63924', 'Kleinheubach',   49.72220, 9.20000, 1800, 1300, 195, '2022-09-20', 'aktiv', true),
  ('DEMO-004', 'Bahnhofsvorplatz',    'Bahnhofstr. 3',    '63911', 'Klingenberg',    49.78330, 9.18330, 2500, 1450, 220, '2024-06-15', 'aktiv', true),
  ('DEMO-005', 'Rewe Markt',          'Elsenfelder Str. 9', '63820', 'Elsenfeld',    49.83860, 9.17060, 2500, 1450, 220, '2021-11-05', 'aktiv', true),
  ('DEMO-006', 'Schulzentrum',        'Schulstr. 12',     '63916', 'Amorbach',       49.64170, 9.21670, 1800, 1300, 195, '2023-08-30', 'aktiv', true),
  ('DEMO-007', 'Feuerwehrhaus',       'Hauptstr. 40',     '63927', 'Buergstadt',     49.71670, 9.28330, 2500, 1450, 220, '2025-01-10', 'aktiv', true),
  ('DEMO-008', 'Aldi Parkplatz',      'Am Sportplatz 2',  '63906', 'Erlenbach',      49.80580, 9.16310, 2500, 1450, 220, '2020-05-18', 'aktiv', true),
  ('DEMO-009', 'Rathaus',             'Marktplatz 1',     '63785', 'Obernburg',      49.83970, 9.14280, 1800, 1300, 195, '2024-10-02', 'aktiv', true),
  ('DEMO-010', 'Sportgelaende',       'Am Anger 7',       '63853', 'Moemlingen',     49.85000, 9.03330, 2500, 1450, 220, '2022-03-14', 'aktiv', true)
on conflict (nummer) do nothing;

-- Fiktiver aktueller Zustand
insert into public.container_zustand (container_id, fuellstand_prozent, abstand_mm, gemessen_am, batterie_v, rssi)
select c.id, w.prozent, w.abstand, now() - (w.stunden || ' hours')::interval, w.batterie, -85
from public.container c
join (values
  ('DEMO-001',  18::smallint,  1230, 3,  3.92),
  ('DEMO-002',  94::smallint,   290, 2,  3.71),
  ('DEMO-003',  61::smallint,   790, 5,  3.85),
  ('DEMO-004',  88::smallint,   360, 1,  3.66),
  ('DEMO-005',  35::smallint,  1020, 4,  3.90),
  ('DEMO-006',  77::smallint,   560, 7,  3.55),
  ('DEMO-007',  12::smallint,  1300, 2,  3.98),
  ('DEMO-008',  99::smallint,   215, 9,  3.44),
  ('DEMO-009',  48::smallint,   870, 6,  3.81),
  ('DEMO-010',   5::smallint,  1390, 40, 3.35)
) as w(nummer, prozent, abstand, stunden, batterie) on w.nummer = c.nummer
on conflict (container_id) do nothing;

-- Ein wenig Verlauf, damit die Detailseite eine Kurve zeigt
insert into public.leerung (container_id, geleert_am, fuellstand_vorher, fuellstand_nachher, art)
select c.id, now() - interval '9 days', 96, 4, 'automatisch'
from public.container c where c.nummer in ('DEMO-002', 'DEMO-008')
on conflict do nothing;
