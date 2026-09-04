#!/bin/sh
# ---------------------------------------------------------------------------
# Erzeugt die Zertifikate, mit denen sich die Sensoren am MQTT-Broker
# ausweisen.
#
#   docker/mqtt/geraete/ca.pem          eigene Geräte-CA (öffentlich)
#   docker/mqtt/geraete/ca-key.pem      deren Schlüssel - VERLÄSST DEN SERVER NIE
#   docker/mqtt/geraete/sensor.pem      Client-Zertifikat für die Sensoren
#   docker/mqtt/geraete/sensor-key.pem  dessen Schlüssel - gehört ins Gerät
#
# Warum überhaupt: die ToolBox-App der EM400-Reihe verlangt bei
# eingeschaltetem TLS zwingend ein Client-Zertifikat ("This field is
# required"). Da ohnehin eines her muss, wird es auch benutzt - der Broker
# verlangt es (require_certificate true). Damit kommt nur noch auf 8883, wer
# diesen Schlüssel hat; Benutzername und Passwort bleiben als zweite Schicht.
#
# Das hat nichts mit dem Let's-Encrypt-Zertifikat zu tun. Das weist den
# SERVER gegenüber dem Gerät aus, diese hier das GERÄT gegenüber dem Server.
# Zwei Richtungen, zwei Zertifikate.
#
# Ohne Ablauf. Ein X.509-Ausweis MUSS formal ein Ende tragen - "unbegrenzt"
# kennt das Format nicht. Dafür gibt es den in RFC 5280 vorgesehenen Wert für
# "kein festgelegtes Ablaufdatum":
#
#   99991231235959Z
#
# Der Grund ist nicht Bequemlichkeit: ein Sensor sitzt verschraubt in einem
# Altkleidercontainer irgendwo im Landkreis. Ein Ablaufdatum hieße, an einem
# Stichtag zu jedem Container zu fahren, das Gehäuse zu öffnen und per NFC
# neu einzustellen - und wer das versäumt, merkt es daran, dass die Meldungen
# aufhören, ohne dass irgendwo ein Fehler steht.
#
# Geprüft werden diese Daten vom Broker, und der hat eine richtige Uhr. Auf
# dem Gerät wird nichts geprüft, was hier abliefe.
#
# Der Preis: kein Rückruf einzelner Geräte - alle Sensoren teilen sich ein
# Zertifikat, wie sie sich auch ein Konto teilen. Wer ein einzelnes Gerät
# ausschließen können muss, erzeugt je Gerät eines und trägt eine Sperrliste
# (crlfile) nach. Ein Ablaufdatum wäre dafür ohnehin das falsche Werkzeug:
# es trifft alle gleichzeitig und den Dieb am spätesten.
#
# Wiederholter Aufruf ändert nichts: vorhandene Dateien bleiben, wie sie
# sind. Neu erzeugen heißt, alle Sensoren neu einzustellen - deshalb passiert
# das nicht aus Versehen.
# ---------------------------------------------------------------------------
set -eu

# Zwei Verzeichnisse, mit Absicht:
#   geraete/     wird in die Container eingehängt - was die Anwendung ausgibt
#   geraete-ca/  wird NIRGENDS eingehängt - hier liegt der CA-Schlüssel
ordner=$(dirname "$0")/../docker/mqtt/geraete
tresor=$(dirname "$0")/../docker/mqtt/geraete-ca
mkdir -p "$ordner" "$tresor"

if [ -f "$ordner/sensor-key.pem" ]; then
  echo "Die Zertifikate bestehen bereits - nichts zu tun."
  echo "Wirklich neu erzeugen? Dann $ordner leeren und danach JEDEN Sensor neu einstellen."
  exit 0
fi

# RFC 5280, 4.1.2.5: "kein festgelegtes Ablaufdatum".
ohne_ablauf=99991231235959Z

echo "Geräte-CA erzeugen ..."
openssl req -x509 -newkey rsa:2048 -nodes -sha256 -not_after "$ohne_ablauf" \
  -keyout "$tresor/ca-key.pem" -out "$ordner/ca.pem" \
  -subj "/O=BRK Kreisverband Miltenberg/CN=Fuellstand Geraete-CA" 2>/dev/null

echo "Client-Zertifikat für die Sensoren erzeugen ..."
openssl req -newkey rsa:2048 -nodes -sha256 \
  -keyout "$ordner/sensor-key.pem" -out "$ordner/sensor.csr" \
  -subj "/O=BRK Kreisverband Miltenberg/CN=sensor" 2>/dev/null

openssl x509 -req -in "$ordner/sensor.csr" -sha256 -not_after "$ohne_ablauf" \
  -CA "$ordner/ca.pem" -CAkey "$tresor/ca-key.pem" -CAcreateserial \
  -out "$ordner/sensor.pem" 2>/dev/null

rm -f "$ordner/sensor.csr" "$ordner/ca.srl"

# Der CA-Schlüssel ist das Einzige, was hier wirklich geheim bleiben muss: wer
# ihn hat, stellt sich beliebige Geräteausweise aus. Er liegt deshalb im
# Tresor - einem Verzeichnis, das in keinen Container eingehängt wird.
chmod 700 "$tresor"
chmod 600 "$tresor/ca-key.pem"

# Zertifikat und Schlüssel der Sensoren muss der Anwendungscontainer lesen
# können - er läuft als eigener Benutzer (nextjs), nicht als root, und gibt
# die Dateien an angemeldete Benutzer aus. Das Verzeichnis liegt unter /root
# und ist von außen ohnehin nicht erreichbar; die Lockerung endet an dieser
# Tür.
chmod 755 "$ordner"
chmod 644 "$ordner/ca.pem" "$ordner/sensor.pem" "$ordner/sensor-key.pem"

echo
echo "Fertig:"
ls -l "$ordner" "$tresor"
echo
echo "Der Broker muss die neue CA lesen:  docker compose restart mqtt"
