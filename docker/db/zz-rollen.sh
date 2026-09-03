#!/bin/bash
# ---------------------------------------------------------------------------
# Setzt die Passwörter der Dienstkonten, mit denen sich Anmeldeverwaltung und
# Datenschnittstelle an der Datenbank melden. Die Rollen selbst bringt das
# supabase/postgres-Image bereits mit.
#
# Zum Namen: Der Postgres-Einstiegspunkt arbeitet /docker-entrypoint-initdb.d
# in alphabetischer Reihenfolge ab. Die Rollen entstehen erst in migrate.sh des
# Images, deshalb muss dieses Skript danach kommen - daher "zz". Und es liegt
# nicht in init-scripts/, denn dort sucht migrate.sh ausschließlich nach
# "*.sql" und überginge eine "*.sh" stillschweigend.
#
# Läuft nur beim allerersten Start, solange das Datenverzeichnis leer ist.
# Werden die Passwörter in der .env nachträglich geändert, müssen sie von Hand
# nachgezogen werden (docs/docker.md, Abschnitt "Wenn etwas klemmt").
# ---------------------------------------------------------------------------
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
  alter role authenticator        with login password '${AUTHENTICATOR_PASSWORT}';
  alter role supabase_auth_admin  with login password '${AUTH_ADMIN_PASSWORT}';
SQL

echo "Dienstkonten eingerichtet."
