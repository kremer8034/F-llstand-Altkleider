# ---------------------------------------------------------------------------
# Die MQTT-Brücke. Ein einziges Programm mit einer einzigen Abhängigkeit -
# deshalb ein eigenes, sehr kleines Abbild statt eines Platzes in der
# Anwendung: die Brücke muss laufen, auch wenn die Anwendung gerade neu
# gebaut wird, und sie hat mit Next.js nichts zu tun.
# ---------------------------------------------------------------------------
FROM node:22-alpine

WORKDIR /app

# Erst die Abhängigkeiten, dann der Quelltext: so bleibt die npm-Schicht im
# Zwischenspeicher, wenn sich nur das Programm ändert.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY bruecke.mjs ./

USER node

CMD ["node", "bruecke.mjs"]
