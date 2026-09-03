# ---------------------------------------------------------------------------
# Die Bruecke MQTT -> /api/ingest/webhook
#
# Ein eigenes, winziges Abbild statt eines Teils der Anwendung: die Bruecke
# haelt eine dauerhafte Verbindung offen, die Anwendung antwortet auf Anfragen.
# Zwei verschiedene Betriebsarten gehoeren nicht in denselben Prozess - und in
# der Anwendung waere `mqtt` eine Abhaengigkeit, die im Browser-Bundle nichts
# zu suchen hat.
# ---------------------------------------------------------------------------
FROM node:22-alpine

WORKDIR /app

# Erst die Abhaengigkeiten, dann der Quelltext: so bleibt die
# Installationsschicht im Zwischenspeicher, solange sich package.json nicht
# aendert.
# npm ci statt npm install: baut genau die Fassungen aus der Sperrdatei. Ein
# Abbild, das je nach Bautag eine andere Bibliotheksfassung enthaelt, ist beim
# Fehlersuchen nichts wert.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY index.mjs ./

# Nicht als root. Das Abbild bringt den Benutzer "node" bereits mit.
USER node

CMD ["node", "index.mjs"]
