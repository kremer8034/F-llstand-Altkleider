-- ============================================================================
-- 0006_stuendlicher_pruflauf.sql
--
-- Stündlicher Prüflauf direkt in der Datenbank: welcher angelernte Sensor hat
-- zu lange nichts gemeldet?
--
-- Warum hier und nicht als Cron-Eintrag bei Vercel: der Hobby-Tarif erlaubt
-- dort nur einen Lauf pro Tag. Bei einer Schwelle von 30 Stunden fiele ein
-- toter Sensor damit erst bis zu 54 Stunden nach seiner letzten Meldung auf.
-- pg_cron gehört zu Supabase, kostet nichts und kann stündlich.
--
-- Beim Docker-Betrieb übernimmt das der Dienst "cron" aus docker-compose.yml;
-- diese Migration schadet dort nicht, ist aber überflüssig.
-- ============================================================================

create extension if not exists pg_cron;

-- Alten Eintrag entfernen, damit die Migration wiederholbar bleibt.
select cron.unschedule('stille-sensoren-pruefen')
where exists (select 1 from cron.job where jobname = 'stille-sensoren-pruefen');

select cron.schedule(
  'stille-sensoren-pruefen',
  '17 * * * *',
  $$select public.pruefe_stille_sensoren();$$
);

-- Kontrolle:
--   select jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 10;
