-- Nachbau der Supabase-Bestandteile, auf die die Migrationen zugreifen
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- auth.uid() liefert im Test den Wert aus einer Sitzungsvariablen
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create role anon;
create role authenticated;
create role service_role;
grant usage on schema public to anon, authenticated, service_role;
