-- ============================================================================
-- 0029_deutsche_zeit.sql
--
-- Die Datenbank rechnet in deutscher Zeit.
--
-- Bis hierher stand sie auf UTC (postgresql.conf des Images). Gemerkt hat man
-- das an zwei Stellen, und beide sind fuer den Betrieb keine Kleinigkeit:
--
--   1. Die Meldungstexte. pruefe_stille_sensoren() und pruefe_messfehler()
--      schreiben einen Zeitpunkt in den Text ("Keine Meldung seit 07.09.2026
--      08:16."). Das war zwei Stunden vor dem, was die Uhr im Buero zeigte -
--      also genau die Angabe, mit der jemand vergleicht, was er getan hat.
--
--   2. current_date. Daran haengt die Tourenplanung: welche Tour "heute"
--      faellig ist, ab wann ein Standort gedeckt ist, welches Datum eine neue
--      Tour bekommt (0012, 0015, 0019, 0022). Zwischen Mitternacht und 02:00
--      Uhr deutscher Zeit lag die Datenbank dabei einen Tag zurueck. Fuer eine
--      Disposition, die frueh am Morgen den Tag plant, ist das kein
--      theoretischer Fall.
--
-- Gesetzt wird die Zone an der Datenbank, nicht in jeder Abfrage. Ein
-- "at time zone 'Europe/Berlin'" an den zwei bekannten to_char-Stellen haette
-- die Meldungstexte in Ordnung gebracht und current_date stehen gelassen -
-- also den Teil geheilt, der auffaellt, und den behalten, der still
-- danebenliegt.
--
-- Was sich dadurch AUSSERDEM aendert: die Schnittstelle gibt Zeitstempel jetzt
-- mit deutschem Versatz aus ("...T15:54:42+02:00" statt "...T13:54:42+00:00").
-- Derselbe Augenblick, andere Schreibweise - Date im Browser und
-- Intl.DateTimeFormat lesen beides richtig. Gespeichert ist ohnehin nichts
-- anderes: timestamptz haelt einen Augenblick fest, keine Ortszeit.
--
-- Die passende Haelfte auf der Anwendungsseite steht in lib/zeit.ts und als
-- TZ=Europe/Berlin in docker-compose.yml.
-- ============================================================================

-- "alter database" wirkt auf NEUE Sitzungen. PostgREST, die Anmeldeverwaltung
-- und die Anwendung halten Verbindungen offen und behalten UTC, bis sie neu
-- verbinden - nach dieser Migration also einmal:
--   docker compose restart rest auth app
do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'Europe/Berlin');
end;
$$;

-- Und fuer die laufende Sitzung, damit eine Probe direkt nach dem Einspielen
-- schon das Richtige zeigt.
set timezone to 'Europe/Berlin';
