/**
 * Kleiner CSV-Leser fuer Exporte aus Excel und aus der
 * DRK-Dienstleistungsdatenbank. Bewusst ohne Bibliothek: das Format ist
 * ueberschaubar, und so bleibt nachvollziehbar, was passiert.
 *
 * Kann: Semikolon oder Komma als Trenner (wird erraten), Felder in
 * Anfuehrungszeichen, verdoppelte Anfuehrungszeichen, Zeilenumbrueche im Feld,
 * BOM am Dateianfang.
 */
export function csvLesen(text: string): string[][] {
  const inhalt = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const trenner = trennerErraten(inhalt);

  const zeilen: string[][] = [];
  let felder: string[] = [];
  let feld = "";
  let inAnfuehrung = false;

  for (let i = 0; i < inhalt.length; i++) {
    const z = inhalt[i];

    if (inAnfuehrung) {
      if (z === '"') {
        if (inhalt[i + 1] === '"') {
          feld += '"';
          i++;
        } else {
          inAnfuehrung = false;
        }
      } else {
        feld += z;
      }
      continue;
    }

    if (z === '"') {
      inAnfuehrung = true;
    } else if (z === trenner) {
      felder.push(feld.trim());
      feld = "";
    } else if (z === "\n") {
      felder.push(feld.trim());
      if (felder.some((f) => f !== "")) zeilen.push(felder);
      felder = [];
      feld = "";
    } else {
      feld += z;
    }
  }

  felder.push(feld.trim());
  if (felder.some((f) => f !== "")) zeilen.push(felder);

  return zeilen;
}

function trennerErraten(inhalt: string): string {
  const ersteZeile = inhalt.split("\n")[0] ?? "";
  const semikolon = (ersteZeile.match(/;/g) ?? []).length;
  const komma = (ersteZeile.match(/,/g) ?? []).length;
  const tab = (ersteZeile.match(/\t/g) ?? []).length;

  if (tab > semikolon && tab > komma) return "\t";
  return komma > semikolon ? "," : ";";
}

/** Spaltennamen normalisieren, damit "PLZ", "plz " und "Plz" gleich sind. */
export function schluesselNormalisieren(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

/** Zahl aus deutscher Schreibweise ("49,7042") oder englischer ("49.7042"). */
export function zahlLesen(wert: string | undefined): number | null {
  if (!wert) return null;
  const bereinigt = wert.trim().replace(/\s/g, "");
  if (!bereinigt) return null;

  // "1.234,56" -> "1234.56" ; "49,7042" -> "49.7042"
  const normalisiert =
    bereinigt.includes(",") && bereinigt.includes(".")
      ? bereinigt.replace(/\./g, "").replace(",", ".")
      : bereinigt.replace(",", ".");

  const zahl = Number(normalisiert);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Datum aus "12.04.2023", "2023-04-12" oder "12/04/2023" lesen. */
export function datumLesen(wert: string | undefined): string | null {
  if (!wert) return null;
  const roh = wert.trim();
  if (!roh) return null;

  const deutsch = roh.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (deutsch) {
    const [, tag, monat, jahr] = deutsch;
    return `${jahr}-${monat.padStart(2, "0")}-${tag.padStart(2, "0")}`;
  }

  const iso = roh.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : null;
}
