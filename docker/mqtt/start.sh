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

# --- Themenrechte ---------------------------------------------------------
# Wichtig: Zeilen VOR dem ersten "user"-Block gelten in Mosquitto nur für
# anonyme Clients. Da anonymer Zugriff abgeschaltet ist, greift dort nichts -
# jedes Konto braucht deshalb einen eigenen Block. Ohne die Datei dürfte jedes
# angemeldete Konto alles, auch alle fremden Meldungen mitlesen.
#
#   Sensoren    dürfen schreiben, aber nichts lesen
#   die Brücke  darf lesen, aber nicht schreiben - sie hat nichts zu senden
#
# Warum das Schreibrecht nicht auf "sensoren/#" begrenzt ist: nicht jede
# Firmware lässt das Uplink-Thema einstellen. Ein Gerät, das auf einem festen
# Thema sendet, verlöre sonst jede Meldung - der Broker verwirft sie still,
# und niemand sieht warum. Was das kostet, ist überschaubar: zuhören tut nur
# die Brücke, und sie prüft jedes Gerät gegen die Datenbank. Das Leseverbot
# bleibt - es ist der Teil, der wirklich schützt.
rechte=/tmp/rechte

: > "$rechte"

konto_darf_senden() {
  printf 'user %s\ntopic write #\n\n' "$1" >> "$rechte"
}

# -b nimmt das Passwort als Argument, fragt also nicht nach.
mosquitto_passwd -b "$datei" "$MQTT_BENUTZER" "$MQTT_PASSWORT"
anzahl=1

# $SYS braucht die Brücke nicht, wohl aber die Innenprüfung des Containers -
# sie meldet sich mit demselben Konto an.
printf 'user %s\ntopic read #\ntopic read $SYS/#\n\n' "$MQTT_BENUTZER" >> "$rechte"

# Das gemeinsame Konto der Sensoren. Es steht in der .env und wird in der
# Oberfläche angezeigt, damit beim Aufnehmen eines Geräts alles auf dem
# Bildschirm steht, was in die NFC-App muss - ohne Sitzung auf dem Server.
#
# Ein Konto je Gerät ginge weiter unten über MQTT_GERAETE. Es lohnt sich aber
# erst, wenn die Themenrechte je Gerät verschieden sind; mit den Rechten
# unten darf ohnehin jeder Sensor genau dasselbe.
if [ -n "${MQTT_SENSOR_PASSWORT:-}" ]; then
  mosquitto_passwd -b "$datei" sensor "$MQTT_SENSOR_PASSWORT"
  konto_darf_senden sensor
  anzahl=$((anzahl + 1))
fi

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
    konto_darf_senden "$name"
    anzahl=$((anzahl + 1))
    IFS=,
  done
  IFS=$alt
fi

chown mosquitto:mosquitto "$datei"
echo "Benutzerliste angelegt: $anzahl Konto/Konten."

chown mosquitto:mosquitto "$rechte"
chmod 600 "$rechte"

# --- Zertifikat für den verschlüsselten Zugang (Port 8883) ----------------
# certbot legt seine Dateien für root ab (Verzeichnis 0700, Schlüssel 0600).
# Mosquitto gibt seine Rechte gleich nach dem Start ab und liest sie dann als
# Benutzer "mosquitto" - und scheitert an genau diesen Rechten.
#
# Deshalb hier eine eigene Kopie, die dem Broker gehört. certbots Dateien
# bleiben unangetastet: ihre Rechte aufzuweichen wäre die schlechtere Lösung,
# und die nächste Erneuerung setzte sie ohnehin zurück. Die Kopie entsteht bei
# jedem Start neu - nach einer Erneuerung genügt `docker compose restart mqtt`.
quelle=/etc/letsencrypt/live/altkleider.tech
ziel=/tmp/zertifikat

# Der 8883-Block kommt nur dazu, wenn das Zertifikat wirklich da ist. Fehlt es
# und der Block stünde trotzdem in der Konfiguration, verweigerte Mosquitto den
# Start - und dann käme kein einziger Messwert mehr an, auch nicht über 1883.
# Lieber ein Port zu, als der ganze Broker.
mkdir -p /tmp/tls

# Beides muss da sein: der Ausweis des Servers UND die CA, gegen die er die
# Geräte prüft. Fehlt die CA, käme mit require_certificate true kein Gerät
# mehr herein - dann lieber den Port zulassen und es sagen.
geraete_ca=/geraete/ca.pem

if [ ! -r "$quelle/privkey.pem" ]; then
  echo "Kein lesbares Zertifikat unter $quelle - Port 8883 bleibt zu."
elif [ ! -r "$geraete_ca" ]; then
  echo "Keine Geräte-CA unter $geraete_ca - Port 8883 bleibt zu."
  echo "        Erzeugen mit: sh scripts/geraete-zertifikate.sh"
else
  mkdir -p "$ziel"
  cp "$quelle/chain.pem" "$quelle/fullchain.pem" "$quelle/privkey.pem" "$ziel/"
  cp "$geraete_ca" "$ziel/geraete-ca.pem"
  chown -R mosquitto:mosquitto "$ziel"
  chmod 700 "$ziel"
  chmod 600 "$ziel"/*.pem
  cp /mosquitto/config/tls-vorlage/*.conf /tmp/tls/ 2>/dev/null || true
  echo "Zertifikate übernommen - verschlüsselter Zugang auf Port 8883 aktiv."
fi

# Der Broker gibt seine Rechte gleich nach dem Start ab und läuft als Benutzer
# "mosquitto"; ihm müssen die beschreibbaren Verzeichnisse gehören. Der
# Einstiegspunkt des Images täte dasselbe, stolperte dabei aber über die
# schreibgeschützt eingehängte Konfiguration und meldete jedes Mal einen
# Fehler - deshalb hier gezielt nur die beiden Verzeichnisse.
chown -R mosquitto:mosquitto /mosquitto/data /mosquitto/log

exec /usr/sbin/mosquitto -c /mosquitto/config/mosquitto.conf
