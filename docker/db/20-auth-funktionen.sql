-- ---------------------------------------------------------------------------
-- auth.uid() und auth.role() lesen die Angaben aus dem Anmelde-Token, das die
-- Datenschnittstelle als Sitzungsvariable durchreicht. Darauf stützen sich
-- sämtliche Zugriffsregeln.
--
-- Das supabase/postgres-Image bringt diese Funktionen normalerweise schon mit;
-- hier stehen sie noch einmal ausdrücklich, damit der Aufbau nicht davon
-- abhängt, welche Fassung des Images gerade verwendet wird.
-- ---------------------------------------------------------------------------

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

grant usage on schema auth to anon, authenticated, service_role;
