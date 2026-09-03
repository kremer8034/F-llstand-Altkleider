#!/usr/bin/env bash
#
# Ein Gerät am Broker anmelden und die Werte für die NFC-App ausgeben.
#
#   ./scripts/mqtt-geraet-anlegen.sh 6746D3486383
#   ./scripts/mqtt-geraet-anlegen.sh bruecke        # einmalig für die Brücke
#
# Warum ein Skript und kein Handgriff in der Oberfläche: das Passwort gehört in
# den Broker, nicht in die Datenbank der Anwendung. Beide Seiten getrennt zu
# halten ist der Punkt - die Anwendung soll Messungen verarbeiten, nicht
# Funkzugänge verwalten. Und ein Passwort, das an zwei Stellen steht, steht
# irgendwann an zwei Stellen verschieden.
#
# Der Benutzername IST die Seriennummer. Daran hängt die Zugriffsregel
# `pattern write altkleider/%u/up` (docker/mosquitto/acl): jedes Gerät darf
# ausschließlich unter seinem eigenen Namen veröffentlichen. Ein anderer
# Benutzername würde diese Regel aushebeln.

set -euo pipefail

NAME="${1:-}"

if [ -z "$NAME" ]; then
  echo "Aufruf: $0 <Seriennummer>" >&2
  echo "        $0 bruecke        (einmalig für die Brücke)" >&2
  exit 1
fi

# Zeichen, die im Benutzernamen nichts zu suchen haben: der Name landet in
# einem MQTT-Thema und in einer Zugriffsregel. Ein Schrägstrich oder ein
# Platzhalter darin würde die Regel unterlaufen.
if ! printf '%s' "$NAME" | grep -qE '^[A-Za-z0-9_.-]+$'; then
  echo "Ungültiger Name: nur Buchstaben, Ziffern, Punkt, Bindestrich, Unterstrich." >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx mosquitto; then
  echo "Der Broker läuft nicht. Erst starten:" >&2
  echo "  docker compose --profile mqtt up -d mosquitto" >&2
  exit 1
fi

# 24 Byte aus dem Zufallsgenerator, auf Buchstaben und Ziffern beschränkt: das
# Passwort wird in der NFC-App von Hand abgetippt, und ein Sonderzeichen, das
# die Tastatur des Handys versteckt, ist an dieser Stelle nur Ärger.
PASSWORT="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"

# -b: Name und Passwort auf der Kommandozeile, ohne Rückfrage.
# Die Datei wird angelegt, falls es sie noch nicht gibt.
# Der Broker legt seine Rechte beim Start ab und laeuft als Benutzer
# "mosquitto". Eine Passwortdatei, die root gehoert und auf 600 steht, kann er
# dann NICHT mehr lesen - er startet gar nicht erst und schreibt nur
# "Unable to open pwfile" ins Protokoll. Deshalb gehoert die Datei ihm.
docker compose exec -T mosquitto sh -c '
  set -e
  mkdir -p /mosquitto/config/zugaenge
  touch /mosquitto/config/zugaenge/passwd
  mosquitto_passwd -b /mosquitto/config/zugaenge/passwd "$1" "$2"
  chown mosquitto:mosquitto /mosquitto/config/zugaenge /mosquitto/config/zugaenge/passwd 2>/dev/null || true
  chmod 600 /mosquitto/config/zugaenge/passwd
' sh "$NAME" "$PASSWORT"

# Neu einlesen ohne Verbindungsabbruch: SIGHUP lädt Passwort- und acl-Datei
# neu. Ein Neustart würde alle anderen Geräte kurz vom Broker werfen.
docker compose kill -s HUP mosquitto >/dev/null 2>&1 || \
  docker compose restart mosquitto >/dev/null

echo
echo "  Gerät „$NAME\" ist am Broker angemeldet."
echo

if [ "$NAME" = "bruecke" ]; then
  cat <<TEXT
  Das gehört in die .env, damit die Brücke sich anmelden kann:

    MQTT_BRUECKE_PASSWORT=$PASSWORT

  Danach:  docker compose --profile mqtt up -d mqtt-bruecke

TEXT
  exit 0
fi

cat <<TEXT
  Diese Werte in der Milesight ToolBox eintragen (Setting → Device →
  Application Mode). Das Passwort wird NUR JETZT angezeigt:

    Application Mode   MQTT
    Broker Address     <Adresse Ihres Brokers, ohne Pfad>
    Broker Port        1883   (8883, sobald TLS eingerichtet ist)
    Client ID          $NAME
    Topic / Uplink     altkleider/$NAME/up
    User Credentials   ein
      Username         $NAME
      Password         $PASSWORT
    TLS                aus  (ein, sobald ein Zertifikat vorliegt)

  Der Benutzername ist zugleich die Seriennummer und muss mit der Geräte-ID
  in der Anwendung übereinstimmen - sonst kommt die Meldung an und lässt
  sich keinem Container zuordnen.

TEXT
