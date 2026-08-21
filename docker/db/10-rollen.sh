#!/bin/bash
# ---------------------------------------------------------------------------
# Setzt die Passwörter der Dienstkonten, mit denen sich Anmeldeverwaltung und
# Datenschnittstelle an der Datenbank melden. Die Rollen selbst bringt das
# supabase/postgres-Image bereits mit.
# ---------------------------------------------------------------------------
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
  alter role authenticator        with login password '${AUTHENTICATOR_PASSWORT}';
  alter role supabase_auth_admin  with login password '${AUTH_ADMIN_PASSWORT}';
SQL

echo "Dienstkonten eingerichtet."
