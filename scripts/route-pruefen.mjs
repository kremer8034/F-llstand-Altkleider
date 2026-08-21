#!/usr/bin/env node
/**
 * Prüft die Routenplanung aus lib/route.ts.
 *
 *   npm run test:route
 *
 * Zwei Fragen werden beantwortet:
 *   1. Ist die optimierte Reihenfolge kürzer als die nach Füllstand?
 *   2. Wie weit liegt das Verfahren vom echten Optimum entfernt? Dazu werden
 *      bei acht Zielen alle 40 320 Reihenfolgen durchgerechnet.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

// lib/route.ts ist TypeScript - vor dem Ausführen übersetzen.
const bauplatz = mkdtempSync(join(tmpdir(), "route-"));
execFileSync(
  "npx",
  ["tsc", "lib/route.ts", "--target", "es2022", "--module", "es2022", "--skipLibCheck", "--outDir", bauplatz],
  { stdio: "inherit" },
);
const { routePlanen, entfernungKm } = await import(pathToFileURL(join(bauplatz, "route.js")).href);

// Die zehn Beispielstandorte aus 0004_beispieldaten.sql
const container = [
  { ort: "Miltenberg",   lat: 49.7042, lng: 9.2646, voll: 18 },
  { ort: "Großheubach",  lat: 49.7333, lng: 9.2167, voll: 94 },
  { ort: "Kleinheubach", lat: 49.7222, lng: 9.2000, voll: 61 },
  { ort: "Klingenberg",  lat: 49.7833, lng: 9.1833, voll: 88 },
  { ort: "Elsenfeld",    lat: 49.8386, lng: 9.1706, voll: 35 },
  { ort: "Amorbach",     lat: 49.6417, lng: 9.2167, voll: 77 },
  { ort: "Bürgstadt",    lat: 49.7167, lng: 9.2833, voll: 12 },
  { ort: "Erlenbach",    lat: 49.8058, lng: 9.1631, voll: 99 },
  { ort: "Obernburg",    lat: 49.8397, lng: 9.1428, voll: 48 },
  { ort: "Mömlingen",    lat: 49.8500, lng: 9.0333, voll: 5 },
];

const start = { lat: 49.7042, lng: 9.2646 };

function strecke(folge, rund) {
  let summe = 0;
  let vorher = start;
  for (const punkt of folge) {
    summe += entfernungKm(vorher, punkt);
    vorher = punkt;
  }
  return rund ? summe + entfernungKm(vorher, start) : summe;
}

test("optimierte Route ist kürzer als die Reihenfolge nach Füllstand", () => {
  const nachFuellstand = [...container].sort((a, b) => b.voll - a.voll);
  const alt = strecke(nachFuellstand, true);
  const neu = routePlanen(container, start, true).strecke;

  console.log(`  nach Füllstand: ${alt.toFixed(1)} km · optimiert: ${neu.toFixed(1)} km ` +
              `· Ersparnis ${(100 * (alt - neu) / alt).toFixed(0)} %`);

  assert.ok(neu < alt, "die optimierte Route muss kürzer sein");
  assert.ok(neu < alt * 0.8, "erwartet werden mindestens 20 % Ersparnis auf diesen Daten");
});

test("Verfahren trifft bei acht Zielen das exakte Optimum", () => {
  const acht = container.slice(0, 8);

  function* reihenfolgen(rest, bisher = []) {
    if (rest.length === 0) yield bisher;
    for (let i = 0; i < rest.length; i++) {
      yield* reihenfolgen([...rest.slice(0, i), ...rest.slice(i + 1)], [...bisher, rest[i]]);
    }
  }

  let optimum = Infinity;
  for (const folge of reihenfolgen(acht)) optimum = Math.min(optimum, strecke(folge, true));

  const gefunden = routePlanen(acht, start, true).strecke;
  const abweichung = (100 * (gefunden - optimum)) / optimum;

  console.log(`  Optimum ${optimum.toFixed(2)} km · gefunden ${gefunden.toFixed(2)} km ` +
              `· Abweichung ${abweichung.toFixed(2)} %`);

  assert.ok(abweichung < 5, `Abweichung vom Optimum zu groß: ${abweichung.toFixed(2)} %`);
});

test("jedes Ziel kommt genau einmal vor", () => {
  const { reihenfolge, etappen } = routePlanen(container, start, false);
  assert.equal(reihenfolge.length, container.length);
  assert.equal(etappen.length, container.length);
  assert.equal(new Set(reihenfolge).size, container.length, "kein Ziel doppelt oder fehlend");
});

test("Randfälle: leer, ein Ziel, ohne Startpunkt", () => {
  assert.deepEqual(routePlanen([], start, true).reihenfolge, []);
  assert.equal(routePlanen([], start, true).strecke, 0);

  const eins = routePlanen([container[0]], start, false);
  assert.deepEqual(eins.reihenfolge, [0]);

  // Ohne Startpunkt zählt der Weg zum ersten Ziel nicht mit.
  const ohneStart = routePlanen(container, null, false);
  assert.equal(ohneStart.reihenfolge.length, container.length);
  assert.equal(ohneStart.etappen[0], 0, "erste Etappe ohne Startpunkt ist 0 km");
});

test("bleibt bei 50 Zielen schnell genug für den Browser", () => {
  const viele = Array.from({ length: 50 }, (_, i) => ({
    lat: 49.6 + ((i * 37) % 100) / 300,
    lng: 9.0 + ((i * 53) % 100) / 300,
  }));

  const start_ms = performance.now();
  routePlanen(viele, start, true);
  const dauer = performance.now() - start_ms;

  console.log(`  50 Ziele in ${dauer.toFixed(0)} ms`);
  assert.ok(dauer < 2000, `zu langsam: ${dauer.toFixed(0)} ms`);
});

process.on("exit", () => rmSync(bauplatz, { recursive: true, force: true }));
