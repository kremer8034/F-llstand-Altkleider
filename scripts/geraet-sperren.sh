#!/bin/sh
# ---------------------------------------------------------------------------
# Sperrt ein einzelnes Gerät aus - für den Fall, dass eines gestohlen wird
# oder verschwindet.
#
#   sh scripts/geraet-sperren.sh 6749F17756790021
#
# Was passiert: der Ausweis des Geräts wird in der Sperrliste (CRL) vermerkt,
# die Liste neu ausgestellt. Nach `docker compose restart mqtt` lässt der
# Broker dieses eine Gerät nicht mehr herein - alle anderen melden weiter, und
# niemand muss zu einem Container fahren.
#
# Ausweis und Schlüssel wandern aus dem eingehängten Verzeichnis in den
# Tresor. Die Sperrliste braucht die Dateien nicht - sie führt Seriennummern,
# und die stehen in der Buchführung (index.txt). Im eingehängten Verzeichnis
# hätten sie nur zwei Nachteile: die Oberfläche böte den Schlüssel weiter zum
# Herunterladen an, und für dasselbe Gerät ließe sich kein neuer Ausweis
# ausstellen.
#
# Ein Gerät, das wieder auftaucht, bekommt deshalb einfach einen neuen:
#
#   sh scripts/geraete-zertifikate.sh <Seriennummer>
#
# Die alte Sperre bleibt bestehen und trifft nur den alten Ausweis - genau so
# soll es sein.
# ---------------------------------------------------------------------------
set -eu

if [ "$#" -ne 1 ]; then
  echo "Aufruf: sh scripts/geraet-sperren.sh <Seriennummer>"
  exit 1
fi

hier=$(dirname "$0")
ordner=$hier/../docker/mqtt/geraete
tresor=$hier/../docker/mqtt/geraete-ca

CA_DIR=$(cd "$tresor" && pwd)
export CA_DIR
CA_ZERT=$(cd "$ordner" && pwd)/ca.pem
export CA_ZERT
cnf=$(cd "$hier/../docker/mqtt" && pwd)/geraete-ca.cnf

name=$1
datei=$(printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '_')

if [ ! -f "$ordner/$datei.pem" ]; then
  echo "FEHLER: Für '$name' gibt es keinen Ausweis unter $ordner."
  echo "        Vorhanden sind:"
  ls "$ordner" | grep -v -- '-key.pem$' | grep -v '^ca.pem$' | grep -v '^crl.pem$' | sed 's/^/          /'
  exit 1
fi

echo "Ausweis von '$name' sperren ..."
openssl ca -batch -config "$cnf" -revoke "$ordner/$datei.pem" \
  -crl_reason keyCompromise 2>&1 | grep -v "^Using configuration" || true

echo "Sperrliste neu ausstellen ..."
openssl ca -batch -config "$cnf" -gencrl -out "$ordner/crl.pem" 2>/dev/null
chmod 644 "$ordner/crl.pem"

# Ausweis und Schlüssel aus der Reichweite der Oberfläche nehmen. Sie bleiben
# im Tresor liegen, damit sich später nachvollziehen lässt, was gesperrt wurde.
mkdir -p "$CA_DIR/gesperrt"
chmod 700 "$CA_DIR/gesperrt"
mv "$ordner/$datei.pem" "$CA_DIR/gesperrt/$datei-$(date +%Y%m%d-%H%M%S).pem"
rm -f "$ordner/$datei-key.pem"

echo
echo "Gesperrt. Jetzt noch:  docker compose restart mqtt"
echo
echo "Danach in der Sperrliste:"
openssl crl -in "$ordner/crl.pem" -noout -text 2>/dev/null \
  | grep -A1 "Serial Number" | sed 's/^/  /' | head -20
