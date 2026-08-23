#!/usr/bin/env node
/**
 * Prüft die Anzeigelogik aus lib/prognose.ts.
 *
 *   npm run test:prognose
 *
 * Gerechnet wird in der Datenbank (supabase/tests/30_prognose.sql prüft das).
 * Hier geht es um die Schicht davor: dass aus einer Zahl ein Satz wird, den
 * man dem Fahrpersonal zeigen kann – kein "in 1 Tagen", kein "alle 1 Tage",
 * und vor allem: kein erfundenes Datum, wo die Grundlage fehlt.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

// lib/prognose.ts ist TypeScript - vor dem Ausführen übersetzen.
const bauplatz = mkdtempSync(join(tmpdir(), "prognose-"));
execFileSync(
  "npx",
  ["tsc", "lib/prognose.ts", "--target", "es2022", "--module", "es2022", "--skipLibCheck", "--outDir", bauplatz],
  { stdio: "inherit" },
);
const {
  tageText,
  rhythmusText,
  jahresText,
  rateText,
  hatPrognose,
  prognoseFehlt,
  rhythmusGuete,
} = await import(pathToFileURL(join(bauplatz, "prognose.js")).href);

test("Tage werden als Umgangssprache ausgegeben", () => {
  assert.equal(tageText(0), "heute");
  assert.equal(tageText(0.4), "heute");
  assert.equal(tageText(1), "morgen");
  assert.equal(tageText(1.4), "morgen");
  assert.equal(tageText(5), "in 5 Tagen");
  assert.equal(tageText(5.4), "in 5 Tagen");
  assert.equal(tageText(null), "–");
  // PostgREST kann numeric als Text liefern
  assert.equal(tageText("5.0"), "in 5 Tagen");
});

test("Der Rhythmus wird nie als '1 Tage' geschrieben", () => {
  assert.equal(rhythmusText(1), "täglich");
  assert.equal(rhythmusText(1.4), "täglich");
  assert.equal(rhythmusText(3.5), "alle 3,5 Tage");
  assert.equal(rhythmusText(20), "alle 20 Tage");
  assert.equal(rhythmusText(null), "noch kein Rhythmus");
});

test("Jahreshochrechnung und Anstieg", () => {
  assert.equal(jahresText(18.3), "18× im Jahr");
  assert.equal(jahresText(null), "–");
  assert.equal(rateText(5), "5,0 %-Punkte am Tag");
  assert.equal(rateText(null), "–");
});

test("Ohne Grundlage wird keine Prognose behauptet", () => {
  assert.equal(hatPrognose(null), false);
  assert.equal(hatPrognose({ grundlage: "keine", tage_bis_tour: null }), false);
  // Grundlage vorhanden, aber kein Wert: trotzdem nichts behaupten
  assert.equal(hatPrognose({ grundlage: "messung", tage_bis_tour: null }), false);
  assert.equal(hatPrognose({ grundlage: "messung", tage_bis_tour: 3 }), true);
  assert.equal(hatPrognose({ grundlage: "historie", tage_bis_tour: 0 }), true);
});

test("Fehlt die Prognose, steht dort ein Satz statt eines Strichs", () => {
  const ohneAlles = prognoseFehlt(null, null);
  assert.match(ohneAlles, /Leerung/);
  assert.ok(ohneAlles.length > 30, "der Satz soll erklären, nicht abkürzen");

  const mitLeerungen = prognoseFehlt(
    { grundlage: "keine", tage_bis_tour: null, rate_prozent_pro_tag: null, fuellstand_prozent: 40 },
    { leerungen_gesamt: 1 },
  );
  assert.match(mitLeerungen, /Rhythmus|Messungen/);
});

test("Die Güte des Rhythmus wird ehrlich benannt", () => {
  assert.equal(rhythmusGuete({ abstaende_anzahl: 1, mittel_tage: 20, streuung_tage: null }).stufe, "duenn");
  assert.equal(rhythmusGuete({ abstaende_anzahl: 0, mittel_tage: null, streuung_tage: null }).stufe, "duenn");
  // 20 ± 0,5 Tage ist verlässlich
  assert.equal(rhythmusGuete({ abstaende_anzahl: 5, mittel_tage: 20, streuung_tage: 0.5 }).stufe, "gut");
  // 14 ± 9 Tage ist es nicht
  assert.equal(rhythmusGuete({ abstaende_anzahl: 5, mittel_tage: 14, streuung_tage: 9 }).stufe, "schwankend");
  // Einzahl beachten
  assert.match(rhythmusGuete({ abstaende_anzahl: 1, mittel_tage: 20, streuung_tage: null }).text, /1 Abstand\b/);
});

process.on("exit", () => rmSync(bauplatz, { recursive: true, force: true }));
