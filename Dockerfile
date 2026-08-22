# ---------------------------------------------------------------------------
# Web-Anwendung als schlankes Laufzeit-Image (Next.js "standalone").
#
# Den standalone-Server schaltet next.config.mjs ein - allerdings nur, wenn die
# Umgebungsvariable VERCEL nicht gesetzt ist. Hier ist sie das nicht, der Ordner
# .next/standalone entsteht also wie erwartet.
#
# Achtung: NEXT_PUBLIC_*-Werte landen fest im Browser-Bundle und werden
# deshalb beim Bauen gesetzt, nicht beim Starten. Wer die oeffentliche Adresse
# aendert, baut neu:  docker compose up -d --build
# ---------------------------------------------------------------------------

FROM node:22-alpine AS abhaengigkeiten
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS bauen
WORKDIR /app
COPY --from=abhaengigkeiten /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS laufzeit
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=bauen /app/public ./public
COPY --from=bauen --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=bauen --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Reine Lebendprüfung: irgendeine Antwort genügt. Ein Test, der die Datenbank
# einbezieht, würde beim Hochfahren fehlschlagen, weil der Weg dorthin über den
# Torwächter führt - und der wartet seinerseits auf diesen Dienst.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(()=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
