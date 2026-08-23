#!/usr/bin/env node
/**
 * Sendet Messungen an /api/ingest – wie es die Firmware täte, nur ohne Sensor.
 *
 *   node scripts/messung-senden.mjs --geraet ALT-0042 --key <hex> --abstand 1800
 *   node scripts/messung-senden.mjs --geraet ALT-0042 --key <hex> --verlauf 14
 *
 * Gedacht für zwei Fälle: die ganze Kette prüfen, solange es noch keine
 * Hardware gibt – und später einen neuen Datenweg gegen dieselbe Messreihe
 * halten (siehe docs/sensor-entscheidung.md).
 *
 * Reihenfolge, sonst bleibt der Füllstand leer:
 *
 *   1. Intern -> Sensoren -> Gerät aufnehmen. Geräte-ID und Schlüssel notieren;
 *      der Schlüssel wird genau einmal angezeigt.
 *   2. Leeren Container melden:  --abstand 1800 --anlass taster
 *   3. Sensor anlernen und "Leerwert übernehmen" antippen.
 *   4. --verlauf 14 – danach stehen Kurve, Leerung und Alarme in der Oberfläche.
 */

import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Aufrufparameter
// ---------------------------------------------------------------------------

function argumente(argv) {
  const werte = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const name = argv[i].slice(2);
    const naechstes = argv[i + 1];
    if (naechstes === undefined || naechstes.startsWith("--")) {
      werte[name] = "true";
    } else {
      werte[name] = naechstes;
      i += 1;
    }
  }
  return werte;
}

const arg = argumente(process.argv.slice(2));

if (arg.hilfe || arg.help) {
  process.stdout.write(hilfetext());
  process.exit(0);
}

const url = (arg.url ?? process.env.INGEST_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const geraet = arg.geraet ?? process.env.GERAETE_ID;
const schluessel = arg.key ?? process.env.GERAETE_KEY;

if (!geraet || !schluessel) {
  process.stderr.write(hilfetext());
  process.stderr.write("\nFEHLER: --geraet und --key fehlen (oder GERAETE_ID / GERAETE_KEY).\n\n");
  process.exit(1);
}
if (!/^[0-9a-fA-F]{64}$/.test(schluessel)) {
  process.stderr.write("\nFEHLER: Der Schlüssel muss 64 Hex-Zeichen haben (32 Byte).\n\n");
  process.exit(1);
}

function hilfetext() {
  return [
    "",
    "Messungen an /api/ingest senden – ohne Hardware.",
    "",
    "  --geraet <ID>       Geräte-ID, z. B. ALT-0042   (oder GERAETE_ID)",
    "  --key <hex>         Geräteschlüssel, 64 Zeichen (oder GERAETE_KEY)",
    "  --url <adresse>     Standard: http://localhost:3000 (oder INGEST_URL)",
    "",
    "Einzelne Messung:",
    "  --abstand <mm>      gemessener Abstand",
    "  --anlass <wort>     intervall | test | taster | schwellwert | neustart",
    "",
    "Verlauf simulieren:",
    "  --verlauf <tage>    Zeitraum, rückwärts von jetzt",
    "  --intervall <min>   Abstand der Meldungen, Standard 360 (4x täglich)",
    "  --leer <mm>         Abstand bei leerem Container, Standard 1800",
    "  --voll <mm>         Abstand bei vollem Container, Standard 270",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Senden
// ---------------------------------------------------------------------------

/**
 * Eine Meldung signieren und abschicken.
 *
 * Der Rumpf wird einmal serialisiert und dann unverändert signiert UND
 * gesendet. Würde er zweimal erzeugt, könnten sich die Zeichenketten
 * unterscheiden und die Signatur nicht mehr passen.
 */
async function senden(nutzlast) {
  const zeitstempel = String(Math.floor(Date.now() / 1000));
  const rumpf = JSON.stringify(nutzlast);
  const signatur = createHmac("sha256", Buffer.from(schluessel, "hex"))
    .update(`${geraet}.${zeitstempel}.${rumpf}`)
    .digest("hex");

  const antwort = await fetch(`${url}/api/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Geraet-Id": geraet,
      "X-Zeitstempel": zeitstempel,
      "X-Signatur": signatur,
    },
    body: rumpf,
  });

  let inhalt;
  try {
    inhalt = await antwort.json();
  } catch {
    inhalt = { fehler: await antwort.text() };
  }
  return { status: antwort.status, inhalt };
}

function zeile(zeitpunkt, abstand, spannung, ergebnis) {
  const zeit = zeitpunkt.toISOString().slice(0, 16).replace("T", " ");
  const ok = ergebnis.status === 200;
  const bemerkung = ok ? "ok" : `${ergebnis.status} ${ergebnis.inhalt.fehler ?? ""}`.trim();
  return `${zeit}  ${String(abstand).padStart(5)} mm  ${spannung.toFixed(2)} V  ${bemerkung}`;
}

// ---------------------------------------------------------------------------
// Fall 1: eine einzelne Messung
// ---------------------------------------------------------------------------

async function einzelmessung() {
  const abstand = Number(arg.abstand);
  if (!Number.isFinite(abstand)) {
    process.stderr.write("\nFEHLER: --abstand <mm> oder --verlauf <tage> angeben.\n\n");
    process.exit(1);
  }

  const spannung = 3.95;
  const ergebnis = await senden({
    abstand_mm: Math.round(abstand),
    batterie_v: spannung,
    temperatur_c: 14.2,
    rssi: -91,
    anlass: arg.anlass ?? "test",
    firmware: "simulation",
  });

  process.stdout.write(`\n${zeile(new Date(), Math.round(abstand), spannung, ergebnis)}\n`);
  if (ergebnis.status === 200) {
    process.stdout.write(
      `Angelernt: ${ergebnis.inhalt.angelernt ? "ja" : "nein"} · ` +
        `Intervall laut Server: ${ergebnis.inhalt.intervall_minuten} min\n\n`,
    );
    if (!ergebnis.inhalt.angelernt) {
      process.stdout.write(
        "Hinweis: Der Sensor hängt an keinem Container. Die Messung ist gespeichert\n" +
          "und wird beim Anlernen nachträglich zugeordnet.\n\n",
      );
    }
  } else {
    process.stdout.write("\n");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fall 2: Verlauf über mehrere Tage
// ---------------------------------------------------------------------------

/**
 * Container läuft voll, wird geleert, läuft wieder voll.
 *
 * Der Zeitstempel in der Kopfzeile ist immer *jetzt* – /api/ingest lehnt alles
 * ab, was mehr als 15 Minuten abweicht. Der historische Zeitpunkt steht
 * stattdessen im Rumpf als `gemessen_am`, von dort übernimmt ihn die Route.
 * Genau so verhält sich auch ein echtes Gerät, das nach einem Funkausfall
 * seinen Puffer nachreicht.
 */
async function verlauf() {
  const tage = Number(arg.verlauf);
  const intervall = Number(arg.intervall ?? 360);
  const leer = Number(arg.leer ?? 1800);
  const voll = Number(arg.voll ?? 270);

  if (!Number.isFinite(tage) || tage <= 0) {
    process.stderr.write("\nFEHLER: --verlauf braucht eine Anzahl Tage.\n\n");
    process.exit(1);
  }
  if (leer <= voll) {
    process.stderr.write("\nFEHLER: --leer muss größer sein als --voll.\n\n");
    process.exit(1);
  }

  const schritte = Math.max(1, Math.round((tage * 24 * 60) / intervall));
  const spanne = leer - voll;

  // Füllgeschwindigkeit so wählen, dass der Container im Zeitraum etwa zweimal
  // volläuft – dann ist mindestens eine Leerung zu sehen. Der Faktor 0,65
  // gleicht aus, dass nachts kaum etwas eingeworfen wird (siehe unten).
  const proSchritt = (spanne * 2) / (schritte * 0.65);

  process.stdout.write(
    `\n${schritte} Meldungen über ${tage} Tage, alle ${intervall} min` +
      ` (leer ${leer} mm, voll ${voll} mm)\n\n`,
  );

  let abstand = leer;
  let fehler = 0;

  for (let i = 0; i < schritte; i += 1) {
    const zeitpunkt = new Date(Date.now() - (schritte - 1 - i) * intervall * 60_000);

    // Nachts wird nichts eingeworfen – tagsüber mehr als am Wochenende.
    const stunde = zeitpunkt.getUTCHours();
    const tagsueber = stunde >= 7 && stunde <= 20 ? 1 : 0.15;
    const rauschen = 1 + (Math.random() - 0.5) * 0.6;

    abstand -= proSchritt * tagsueber * rauschen;

    // Voll: die nächste Leerung setzt den Stand zurück.
    if (abstand <= voll) abstand = leer;

    // Batterie sinkt über den Zeitraum von 4,10 V auf knapp unter die
    // Alarmschwelle von 3,40 V – so ist auch der Batteriealarm zu sehen.
    const spannung = 4.1 - (0.75 * i) / Math.max(1, schritte - 1);

    const gerundet = Math.round(abstand);
    const ergebnis = await senden({
      abstand_mm: gerundet,
      batterie_v: Number(spannung.toFixed(2)),
      temperatur_c: Number((8 + Math.random() * 12).toFixed(1)),
      rssi: -95 + Math.round((Math.random() - 0.5) * 12),
      anlass: "intervall",
      firmware: "simulation",
      gemessen_am: zeitpunkt.toISOString(),
    });

    if (ergebnis.status !== 200) fehler += 1;
    process.stdout.write(`${zeile(zeitpunkt, gerundet, spannung, ergebnis)}\n`);
  }

  process.stdout.write(
    `\n${schritte - fehler} von ${schritte} angenommen` + (fehler ? `, ${fehler} abgelehnt` : "") + ".\n",
  );
  process.stdout.write(
    "\nJetzt in der Oberfläche nachsehen: Containerdetail (Kurve und Leerungen),\n" +
      "Übersicht (Alarme), Tourenliste, öffentliche Karte.\n\n",
  );

  if (fehler) process.exit(1);
}

// ---------------------------------------------------------------------------

if (arg.verlauf) {
  await verlauf();
} else {
  await einzelmessung();
}
