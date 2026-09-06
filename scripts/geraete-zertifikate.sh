#!/bin/sh
# ---------------------------------------------------------------------------
# Stellt die Ausweise aus, mit denen sich die Sensoren am MQTT-Broker melden.
#
#   sh scripts/geraete-zertifikate.sh                 CA anlegen, Liste zeigen
#   sh scripts/geraete-zertifikate.sh 6749F17756790021 [weitere...]
#   sh scripts/geraete-zertifikate.sh --alle          für jeden Sensor aus der
#                                                     Datenbank, der keinen hat
#
# Je Gerät ein eigener Ausweis. Das ist der Unterschied zur ersten Fassung,
# die einen für alle ausstellte: damit war ein gestohlenes Gerät nur
# auszusperren, indem man ALLE neu einstellt - also einmal quer durch den
# Landkreis. Jetzt genügt:
#
#   sh scripts/geraet-sperren.sh <Seriennummer>
#
# Zwei Verzeichnisse, mit Absicht:
#   docker/mqtt/geraete/     wird eingehängt - Ausweise, CA, Sperrliste
#   docker/mqtt/geraete-ca/  wird NIRGENDS eingehängt - CA-Schlüssel und
#                            Buchführung (index.txt); wer sie hat, stellt
#                            sich beliebige Geräteausweise aus
#
# Kein Ablaufdatum: ein X.509-Ausweis muss formal eines tragen, deshalb steht
# der in RFC 5280 dafür vorgesehene Wert 99991231235959Z darin. Ein echtes
# Ablaufdatum hieße, an einem Stichtag zu jedem Container zu fahren - und wer
# das versäumt, merkt es daran, dass die Meldungen aufhören, ohne dass
# irgendwo ein Fehler steht.
# ---------------------------------------------------------------------------
set -eu

hier=$(dirname "$0")
ordner=$hier/../docker/mqtt/geraete
tresor=$hier/../docker/mqtt/geraete-ca

CA_DIR=$(cd "$tresor" 2>/dev/null && pwd || (mkdir -p "$tresor" && cd "$tresor" && pwd))
export CA_DIR
mkdir -p "$ordner"
CA_ZERT=$(cd "$ordner" && pwd)/ca.pem
export CA_ZERT

cnf=$(cd "$hier/../docker/mqtt" && pwd)/geraete-ca.cnf
ohne_ablauf=99991231235959Z

# Die CA-Konfiguration gehoert ins Repository und liegt deshalb NICHT im
# Tresor - der ist ignoriert, ein frischer Klon haette sie sonst nicht.
if [ ! -f "$cnf" ]; then
  echo "FEHLER: $cnf fehlt - die Datei gehört zum Repository."
  exit 1
fi

# --- CA anlegen, falls es sie noch nicht gibt ------------------------------
if [ ! -f "$CA_DIR/ca-key.pem" ]; then
  echo "Geräte-CA erzeugen ..."
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -not_after "$ohne_ablauf" \
    -keyout "$CA_DIR/ca-key.pem" -out "$CA_ZERT" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -subj "/O=BRK Kreisverband Miltenberg/CN=Fuellstand Geraete-CA" 2>/dev/null
  chmod 600 "$CA_DIR/ca-key.pem"
  chmod 644 "$CA_ZERT"
fi

# --- Buchführung anlegen --------------------------------------------------
mkdir -p "$CA_DIR/ausgestellt"
[ -f "$CA_DIR/index.txt" ] || : > "$CA_DIR/index.txt"
[ -f "$CA_DIR/serial" ] || echo 1000 > "$CA_DIR/serial"
[ -f "$CA_DIR/crlnumber" ] || echo 1000 > "$CA_DIR/crlnumber"
chmod 700 "$CA_DIR"

# ---------------------------------------------------------------------------
sperrliste_erneuern() {
  openssl ca -batch -config "$cnf" -gencrl -out "$ordner/crl.pem" 2>/dev/null
  chmod 644 "$ordner/crl.pem"
}

ausstellen() {
  name=$1
  # Aus der Seriennummer wird ein Dateiname - alles Ungewöhnliche fliegt raus,
  # damit hier kein Pfad entstehen kann.
  datei=$(printf '%s' "$name" | tr -c 'A-Za-z0-9._-' '_')

  if [ -f "$ordner/$datei.pem" ]; then
    echo "  $name: hat schon einen Ausweis - übersprungen."
    return 0
  fi

  openssl req -newkey rsa:2048 -nodes -sha256 \
    -keyout "$ordner/$datei-key.pem" -out "$CA_DIR/$datei.csr" \
    -subj "/O=BRK Kreisverband Miltenberg/CN=$name" 2>/dev/null

  openssl ca -batch -config "$cnf" \
    -in "$CA_DIR/$datei.csr" -out "$ordner/$datei.pem" \
    -enddate "$ohne_ablauf" -notext 2>/dev/null

  rm -f "$CA_DIR/$datei.csr"

  # Der Anwendungscontainer läuft als eigener Benutzer und muss beide Dateien
  # lesen können, um sie an angemeldete Benutzer auszugeben. Das Verzeichnis
  # liegt unter /root und ist von außen ohnehin nicht erreichbar.
  chmod 644 "$ordner/$datei.pem" "$ordner/$datei-key.pem"
  echo "  $name: ausgestellt."
}

# --- Wen betrifft es? -----------------------------------------------------
if [ "${1:-}" = "--alle" ]; then
  echo "Sensoren aus der Datenbank holen ..."
  liste=$(docker compose exec -T db psql -U postgres -A -t \
            -c "select geraete_id from public.sensor order by geraete_id" 2>/dev/null || true)
  if [ -z "$liste" ]; then
    echo "Keine Sensoren gefunden (läuft die Datenbank?)."
    liste=""
  fi
  for sn in $liste; do ausstellen "$sn"; done
elif [ "$#" -gt 0 ]; then
  for sn in "$@"; do ausstellen "$sn"; done
fi

sperrliste_erneuern
chmod 755 "$ordner"

echo
echo "Ausweise in $ordner:"
ls "$ordner" | sed 's/^/  /'
echo
echo "Gesperrt (aus der Buchführung):"
# index.txt ist mit Tabulatoren getrennt: Status, Ablauf, Sperrdatum,
# Seriennummer, Datei, Name. Aus dem Namen interessiert nur der CN.
if grep -q '^R' "$CA_DIR/index.txt" 2>/dev/null; then
  awk -F'\t' '$1=="R" { name=$6; sub(/.*\/CN=/, "", name); sub(/\/.*/, "", name); print "  " name " (Ausweis " $4 ")" }' \
    "$CA_DIR/index.txt"
else
  echo "  nichts"
fi
echo
echo "Damit der Broker die Sperrliste übernimmt:  docker compose restart mqtt"
