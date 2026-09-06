#!/bin/sh
# ---------------------------------------------------------------------------
# Spielt das Anwendungsschema ein - jede Migration genau einmal.
#
# Zwei Dinge sind zu beachten und werden hier abgefangen:
#   1. Der Auslöser auf auth.users setzt voraus, dass die Anmeldeverwaltung
#      ihre eigenen Tabellen bereits angelegt hat - darauf wird gewartet.
#   2. Die meisten Migrationen sind NICHT mehrfach ausführbar: "create type",
#      "create policy" und "add constraint" scheitern beim zweiten Lauf.
#
# Deshalb führt public.schema_migration Buch. Vorher stand hier eine feste
# Liste von Dateien, die bei jedem Start liefen - alles, was danach dazukam
# (0009 bis 0020), wurde nie eingespielt. Auf einer laufenden Anlage fehlten
# damit unter anderem sensor.bauart, die Standorte, die Tourenplanung und die
# Gruppen: die Oberfläche bot sie an, die Datenbank kannte sie nicht.
#
# 0004 (Beispieldaten) läuft nur, wenn BEISPIELDATEN=ja gesetzt ist.
# 0006 bleibt außen vor: den stündlichen Prüflauf übernimmt der Dienst "cron"
# aus docker-compose.yml, nicht pg_cron.
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

# --- Buchführung ----------------------------------------------------------
psql -v ON_ERROR_STOP=1 -q -c "
  create table if not exists public.schema_migration (
    datei          text primary key,
    eingespielt_am timestamptz not null default now()
  );"

# Eine Anlage, die es vor dieser Buchführung schon gab: die Dateien, die der
# alte Einspieler ausgeführt hat, gelten als erledigt. Alles Übrige wird
# gleich nachgezogen.
bestand=$(psql -tAc "select count(*) from public.schema_migration;")
schon_da=$(psql -tAc "select to_regclass('public.container') is not null;")

if [ "$bestand" = "0" ] && [ "$schon_da" = "t" ]; then
  echo "Bestehende Anlage - die früher eingespielten Migrationen werden vermerkt."
  psql -v ON_ERROR_STOP=1 -q -c "
    insert into public.schema_migration (datei) values
      ('0001_schema.sql'), ('0002_funktionen.sql'), ('0003_rls.sql'),
      ('0005_funktionsrechte.sql'), ('0007_betriebshof.sql'), ('0008_rollenschutz.sql')
    on conflict do nothing;"
fi

# --- Einspielen -----------------------------------------------------------
eingespielt=0

for datei in /migrations/*.sql; do
  name=$(basename "$datei")

  case "$name" in
    0004_*)
      # Beispieldaten nur auf ausdrücklichen Wunsch.
      [ "${BEISPIELDATEN:-nein}" = "ja" ] || continue
      ;;
    0006_*)
      # pg_cron wird hier nicht benutzt - siehe Kopf dieser Datei.
      continue
      ;;
  esac

  fertig=$(psql -tAc "select exists (select 1 from public.schema_migration where datei = '$name');")
  [ "$fertig" = "t" ] && continue

  echo "Spiele ein: $name"
  # -1: die ganze Datei in einer Transaktion. Bricht sie ab, ist nichts halb
  # eingespielt - und der Vermerk unterbleibt, der nächste Start versucht es
  # erneut.
  psql -v ON_ERROR_STOP=1 -q -1 -f "$datei"
  psql -v ON_ERROR_STOP=1 -q -c "insert into public.schema_migration (datei) values ('$name');"
  eingespielt=$((eingespielt + 1))
done

# Die Datenschnittstelle kennt die neuen Tabellen sonst noch nicht.
psql -q -c "notify pgrst, 'reload schema';"

if [ "$eingespielt" = "0" ]; then
  echo "Schema ist aktuell - nichts einzuspielen."
else
  echo "Schema eingespielt: $eingespielt Migration(en)."
fi
