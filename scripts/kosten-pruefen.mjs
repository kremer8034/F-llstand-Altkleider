#!/usr/bin/env node
/**
 * Prüft das Kostenmodell aus lib/kosten.ts und den Umweg aus lib/route.ts.
 *
 *   npm run test:kosten
 *
 * Maßstab sind die beiden durchgerechneten Beispiele aus docs/tourenplanung.md:
 * ein Cluster an der Route gegen einen Einzelcontainer 34 km abseits. Wenn die
 * Zahlen dort und hier auseinanderlaufen, stimmt eins von beidem nicht.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const bauplatz = mkdtempSync(join(tmpdir(), "kosten-"));
execFileSync(
  "npx",
  [
    "tsc",
    "lib/kosten.ts",
    "lib/route.ts",
    "lib/einstellungen.ts",
    "--target", "es2022",
    "--module", "es2022",
    "--moduleResolution", "bundler",
    "--skipLibCheck",
    "--outDir", bauplatz,
  ],
  { stdio: "inherit" },
);

// TypeScript schreibt relative Importe ohne Dateiendung ("./einstellungen"),
// Node verlangt sie ("./einstellungen.js"). Im Next.js-Bau erledigt das der
// Bündler; hier laufen die Dateien roh, also ergänzen wir die Endung selbst.
for (const datei of readdirSync(bauplatz).filter((d) => d.endsWith(".js"))) {
  const pfad = join(bauplatz, datei);
  writeFileSync(
    pfad,
    readFileSync(pfad, "utf8").replace(/from "(\.\/[^"]+?)(?<!\.js)"/g, 'from "$1.js"'),
  );
}

const { stoppKosten, KOSTEN_STANDARD, tourdurchschnitt, istTeuer } = await import(
  pathToFileURL(join(bauplatz, "kosten.js")).href
);
const { umwegKm, entfernungKm } = await import(pathToFileURL(join(bauplatz, "route.js")).href);

const rund = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

// Gerechnet wird seit 0022 in Behaelterfuellungen statt in Litern: drei
// Behaelter zu 85 % sind 2,55 Fuellungen. Die Kosten sind dieselben, nur die
// Bezugsgroesse der Kennzahl aendert sich - und der Faktor zwischen zwei
// Stopps bleibt unberuehrt, weil sich die Einheit herauskuerzt.
test("Cluster an der Route: 18,60 € und 7,29 € je Füllung", () => {
  const k = stoppKosten({ umwegKm: 2, containerAnzahl: 3, ertragFuellungen: 3 * 0.85 }, KOSTEN_STANDARD);
  assert.equal(rund(k.ertragFuellungen), 2.55);
  assert.equal(rund(k.zeitMinuten, 1), 22.7);
  assert.equal(rund(k.fahrtkosten), 1.6);
  assert.equal(rund(k.zeitkosten), 17);
  assert.equal(rund(k.kosten), 18.6);
  assert.equal(rund(k.euroJeFuellung), 7.29);
});

test("Einzelbehälter 34 km abseits: 70,20 € und 73,89 € je Füllung", () => {
  const k = stoppKosten({ umwegKm: 34, containerAnzahl: 1, ertragFuellungen: 0.95 }, KOSTEN_STANDARD);
  assert.equal(rund(k.ertragFuellungen), 0.95);
  assert.equal(rund(k.zeitMinuten, 1), 57.3);
  assert.equal(rund(k.fahrtkosten), 27.2);
  assert.equal(rund(k.zeitkosten), 43);
  assert.equal(rund(k.kosten), 70.2);
  assert.equal(rund(k.euroJeFuellung), 73.89);
});

test("Der Faktor zwischen beiden ist rund zehn", () => {
  const a = stoppKosten({ umwegKm: 2, containerAnzahl: 3, ertragFuellungen: 2.55 }, KOSTEN_STANDARD);
  const b = stoppKosten({ umwegKm: 34, containerAnzahl: 1, ertragFuellungen: 0.95 }, KOSTEN_STANDARD);
  const faktor = b.euroJeFuellung / a.euroJeFuellung;
  assert.ok(faktor > 9.5 && faktor < 10.5, `Faktor ${faktor} liegt nicht bei zehn`);
});

test("Bei einem weiten Stopp überwiegen die Personalkosten", () => {
  const k = stoppKosten({ umwegKm: 34, containerAnzahl: 1, ertragFuellungen: 0.95 }, KOSTEN_STANDARD);
  assert.ok(k.zeitkosten > k.fahrtkosten, "Zeit muss teurer sein als Sprit");
  assert.ok(k.zeitkosten / k.kosten > 0.6, "rund zwei Drittel sollten Personalkosten sein");
});

test("Ohne Ertrag gibt es keine Kennzahl statt einer Unendlichkeit", () => {
  const k = stoppKosten({ umwegKm: 5, containerAnzahl: 1, ertragFuellungen: 0 }, KOSTEN_STANDARD);
  assert.equal(k.euroJeFuellung, null);
  assert.ok(k.kosten > 0);
});

test("Der Umweg ist die Einfügung, nicht die Entfernung", () => {
  // Drei Punkte auf einer Linie: ein Ziel dazwischen kostet fast nichts.
  const a = { lat: 49.7, lng: 9.2 };
  const b = { lat: 49.8, lng: 9.2 };
  const mitte = { lat: 49.75, lng: 9.2 };

  assert.ok(umwegKm([b], a, mitte, false) < 0.01, "Zwischenstopp auf der Geraden kostet nichts");
  assert.ok(umwegKm([b], a, mitte, true) < 0.01, "auch als Rundfahrt nicht");
});

test("Am offenen Ende kostet ein Stopp nur die letzte Etappe", () => {
  // Das ist kein Schönheitsfehler, sondern richtig: eine Tour ohne Rückweg
  // endet dort, wo der letzte Container steht. Erst die Rundfahrt zum
  // Betriebshof macht den Abstecher doppelt teuer.
  const a = { lat: 49.7, lng: 9.2 };
  const b = { lat: 49.8, lng: 9.2 };
  const abseits = { lat: 49.75, lng: 9.6 };

  const offen = umwegKm([b], a, abseits, false);
  const rund = umwegKm([b], a, abseits, true);

  assert.equal(Math.round(offen), Math.round(entfernungKm(b, abseits)));
  assert.ok(rund > offen * 1.5, `Rundfahrt kostet ${rund} km, offen ${offen} km`);
  assert.equal(Math.round(rund), Math.round(
    entfernungKm(b, abseits) + entfernungKm(abseits, a) - entfernungKm(b, a),
  ));
});

test("Ohne andere Ziele ist der Umweg die Fahrt selbst", () => {
  const start = { lat: 49.7, lng: 9.2 };
  const ziel = { lat: 49.8, lng: 9.2 };
  const einfach = umwegKm([], start, ziel, false);
  const hin_und_zurueck = umwegKm([], start, ziel, true);

  assert.equal(rund(einfach, 3), rund(entfernungKm(start, ziel), 3));
  assert.equal(rund(hin_und_zurueck, 3), rund(2 * entfernungKm(start, ziel), 3));
});

test("Der Tourdurchschnitt ist mengengewichtet", () => {
  const gross = stoppKosten({ umwegKm: 2, containerAnzahl: 3, ertragFuellungen: 2.55 }, KOSTEN_STANDARD);
  const klein = stoppKosten({ umwegKm: 2, containerAnzahl: 1, ertragFuellungen: 0.04 }, KOSTEN_STANDARD);

  const schnitt = tourdurchschnitt([gross, klein]);
  // Ungewichtet läge der Schnitt bei einem Vielfachen - der kleine Stopp allein
  // kostet je Füllung ein Hundertfaches. Gewichtet bleibt er nahe am großen.
  // Geprüft wird das Verhältnis statt eines festen Eurobetrags: der hing an der
  // Einheit und wäre mit ihr stillschweigend falsch geworden.
  const ungewichtet = (gross.euroJeFuellung + klein.euroJeFuellung) / 2;
  assert.ok(
    schnitt < ungewichtet / 10,
    `Schnitt ${schnitt} liegt beim ungewichteten Mittel (${ungewichtet}) statt darunter`,
  );
  assert.ok(
    schnitt < gross.euroJeFuellung * 2,
    `Schnitt ${schnitt} liegt nicht nahe am großen Stopp (${gross.euroJeFuellung})`,
  );
  assert.equal(tourdurchschnitt([]), null);
});

test("Teuer ist relativ zur Tour, nicht absolut", () => {
  const guenstig = stoppKosten({ umwegKm: 2, containerAnzahl: 3, ertragFuellungen: 2.55 }, KOSTEN_STANDARD);
  const teuer = stoppKosten({ umwegKm: 34, containerAnzahl: 1, ertragFuellungen: 0.95 }, KOSTEN_STANDARD);
  const schnitt = tourdurchschnitt([guenstig]);

  assert.equal(istTeuer(teuer, schnitt), true);
  assert.equal(istTeuer(guenstig, schnitt), false);
  assert.equal(istTeuer(teuer, null), false, "ohne Vergleichsmaßstab wird nichts als teuer bezeichnet");
});

process.on("exit", () => rmSync(bauplatz, { recursive: true, force: true }));
