#!/bin/ash
# ---------------------------------------------------------------------------
# Startet den MQTT-Broker und legt vorher die Benutzerliste an.
#
# Mosquitto liest Zugangsdaten nur aus einer Datei, nicht aus Umgebungs-
# variablen. Diese Datei hier baut sie bei jedem Start neu aus der .env:
#
#   MQTT_BENUTZER / MQTT_PASSWORT   Hauptkonto (Brücke, Fehlersuche)
#   MQTT_GERAETE                    Geräte, Form: name:passwort,name2:passwort2
#
# Dadurch stehen alle Passwörter an einer Stelle – in der .env, die nicht ins
# Repository gehört. Ein neues Gerät kommt hinzu, indem es in MQTT_GERAETE
# ergänzt und `docker compose restart mqtt` aufgerufen wird; bestehende
# Verbindungen der anderen Geräte stört das nicht länger als eine Sekunde.
# ---------------------------------------------------------------------------
set -eu

datei=/mosquitto/config/passwort

if [ -z "${MQTT_BENUTZER:-}" ] || [ -z "${MQTT_PASSWORT:-}" ]; then
  echo "FEHLER: MQTT_BENUTZER und MQTT_PASSWORT fehlen in der .env."
  echo "        Ohne Konto nimmt der Broker niemanden an (allow_anonymous false)."
  exit 1
fi

: > "$datei"
chmod 600 "$datei"

# -b nimmt das Passwort als Argument, fragt also nicht nach.
mosquitto_passwd -b "$datei" "$MQTT_BENUTZER" "$MQTT_PASSWORT"
anzahl=1

# Geräteliste: durch Komma getrennt, je Eintrag name:passwort.
if [ -n "${MQTT_GERAETE:-}" ]; then
  alt=$IFS
  IFS=,
  for eintrag in $MQTT_GERAETE; do
    IFS=$alt
    name=${eintrag%%:*}
    passwort=${eintrag#*:}
    if [ -z "$name" ] || [ "$name" = "$passwort" ]; then
      echo "Übersprungen: '$eintrag' – erwartet wird name:passwort."
      IFS=,
      continue
    fi
    mosquitto_passwd -b "$datei" "$name" "$passwort"
    anzahl=$((anzahl + 1))
    IFS=,
  done
  IFS=$alt
fi

chown mosquitto:mosquitto "$datei"
echo "Benutzerliste angelegt: $anzahl Konto/Konten."

# Der Broker gibt seine Rechte gleich nach dem Start ab und läuft als Benutzer
# "mosquitto"; ihm müssen die beschreibbaren Verzeichnisse gehören. Der
# Einstiegspunkt des Images täte dasselbe, stolperte dabei aber über die
# schreibgeschützt eingehängte Konfiguration und meldete jedes Mal einen
# Fehler - deshalb hier gezielt nur die beiden Verzeichnisse.
chown -R mosquitto:mosquitto /mosquitto/data /mosquitto/log

exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
