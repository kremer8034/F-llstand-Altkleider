#!/usr/bin/env node
/**
 * Erzeugt alle Schlüssel und Passwörter für den Docker-Betrieb.
 *
 *   node scripts/schluessel-erzeugen.mjs        anzeigen
 *   node scripts/schluessel-erzeugen.mjs >> .env   direkt anhängen
 *
 * ANON_KEY und SERVICE_ROLE_KEY sind keine Zufallszeichenketten, sondern
 * Ausweise (JWT), die mit JWT_SECRET unterschrieben sind. Deshalb müssen die
 * drei immer zusammen passen: wird JWT_SECRET getauscht, sind die beiden
 * anderen ungültig.
 */

import { createHmac, randomBytes } from "node:crypto";

const base64url = (eingabe) =>
  Buffer.from(eingabe).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function jwt(rolle, geheimnis, jahre = 10) {
  const jetzt = Math.floor(Date.now() / 1000);
  const kopf = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const rumpf = base64url(
    JSON.stringify({ role: rolle, iss: "supabase", iat: jetzt, exp: jetzt + jahre * 365 * 24 * 3600 }),
  );
  const signatur = createHmac("sha256", geheimnis)
    .update(`${kopf}.${rumpf}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return `${kopf}.${rumpf}.${signatur}`;
}

// Passwörter ohne Sonderzeichen: sie stehen in Verbindungsadressen
// (postgres://benutzer:passwort@host) und würden dort sonst zerlegt.
const passwort = () => randomBytes(24).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 28);

const jwtGeheimnis = randomBytes(48).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);

const zeilen = [
  "",
  `# erzeugt am ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  `POSTGRES_PASSWORD=${passwort()}`,
  `AUTH_ADMIN_PASSWORT=${passwort()}`,
  `AUTHENTICATOR_PASSWORT=${passwort()}`,
  `JWT_SECRET=${jwtGeheimnis}`,
  `ANON_KEY=${jwt("anon", jwtGeheimnis)}`,
  `SERVICE_ROLE_KEY=${jwt("service_role", jwtGeheimnis)}`,
  `GERAETE_PROVISIONIERUNG_SCHLUESSEL=${randomBytes(32).toString("hex")}`,
  `INGEST_WEBHOOK_TOKEN=${randomBytes(32).toString("hex")}`,
  `CRON_SECRET=${passwort()}`,
  "",
  "# --- MQTT ---",
  "# Konto der Bruecke (liest mit) und gemeinsames Konto der Sensoren. Das",
  "# Sensorpasswort zeigt die Oberflaeche beim Aufnehmen eines Geraets an -",
  "# es gehoert per NFC-App ins Geraet (docs/mqtt.md).",
  "MQTT_BENUTZER=bruecke",
  `MQTT_PASSWORT=${randomBytes(24).toString("hex")}`,
  `MQTT_SENSOR_PASSWORT=${randomBytes(24).toString("hex")}`,
  "",
];

process.stdout.write(zeilen.join("\n"));

if (process.stdout.isTTY) {
  process.stderr.write(
    [
      "",
      "Diese Zeilen gehören in die Datei .env.",
      "Direkt anhängen:  node scripts/schluessel-erzeugen.mjs >> .env",
      "",
      "Achtung: SERVICE_ROLE_KEY umgeht sämtliche Zugriffsregeln.",
      "Er gehört ausschließlich auf den Server, niemals in den Browser.",
      "",
    ].join("\n"),
  );
}
