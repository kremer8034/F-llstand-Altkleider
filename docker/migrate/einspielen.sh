#!/bin/sh
# ---------------------------------------------------------------------------
# Spielt das Anwendungsschema ein. Läuft einmalig beim ersten Start.
#
# Zwei Dinge sind zu beachten und werden hier abgefangen:
#   1. Der Auslöser auf auth.users setzt voraus, dass die Anmeldeverwaltung
#      ihre eigenen Tabellen bereits angelegt hat - darauf wird gewartet.
#   2. Die Migrationen sind nicht mehrfach ausführbar (create type & Co.).
#      Steht das Schema schon, wird übersprungen.
# ---------------------------------------------------------------------------
set -eu

echo "Warte auf die Datenbank ..."
for i in $(seq 1 60); do
  pg_isready -q && break
  sleep 2
done

echo "Warte darauf, dass die Anmeldeverwaltung auth.users angelegt hat ..."
for i in $(seq 1 90); do
  vorhanden=$(psql -tAc "select to_regclass('auth.users') is not null;" 2>/dev/null || echo f)
  [ "$vorhanden" = "t" ] && break
  sleep 2
done

if [ "${vorhanden:-f}" != "t" ]; then
  echo "FEHLER: auth.users ist nach drei Minuten nicht vorhanden."
  echo "        Protokoll des Dienstes 'auth' prüfen: docker compose logs auth"
  exit 1
fi

schon_da=$(psql -tAc "select to_regclass('public.container') is not null;")
if [ "$schon_da" = "t" ]; then
  echo "Schema besteht bereits - nichts zu tun."
  psql -q -c "notify pgrst, 'reload schema';"
  exit 0
fi

for datei in /migrations/0001_schema.sql /migrations/0002_funktionen.sql /migrations/0003_rls.sql; do
  echo "Spiele ein: $(basename "$datei")"
  psql -v ON_ERROR_STOP=1 -q -f "$datei"
done

if [ "${BEISPIELDATEN:-nein}" = "ja" ]; then
  echo "Spiele ein: Beispieldaten"
  psql -v ON_ERROR_STOP=1 -q -f /migrations/0004_beispieldaten.sql
fi

# Die Datenschnittstelle kennt die neuen Tabellen sonst noch nicht.
psql -q -c "notify pgrst, 'reload schema';"

echo "Schema eingespielt."
