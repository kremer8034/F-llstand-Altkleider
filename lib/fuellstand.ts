import type { Fuellstandsstufe } from "./typen";

/**
 * Fuellstand ist eine Zustandsgroesse, keine Kategorie: die vier Stufen tragen
 * deshalb die Status-Farben (gut / warnung / ernst / kritisch) und zusaetzlich
 * eine eigene FORM als Symbol.
 *
 * Das ist kein Schmuck: gelb (#fab219) und orange (#ec835a) liegen mit einem
 * Farbabstand von rund 13 dicht beieinander - bei Sonnenlicht auf dem Handy,
 * im Graustufendruck und bei Farbfehlsichtigkeit sind sie kaum zu trennen.
 * Deshalb steht neben jeder Farbe immer ein unterscheidbares Symbol und ein
 * Text. Wer die Symbole spaeter "aufraeumt", nimmt der Anzeige ihre
 * Verlaesslichkeit.
 */
export const STUFEN: Record<
  Fuellstandsstufe,
  { text: string; kurz: string; farbe: string; variable: string; ab: number }
> = {
  frei:       { text: "Frei",            kurz: "frei",  farbe: "#0ca30c", variable: "var(--gut)",       ab: 0 },
  teilweise:  { text: "Teilweise voll",  kurz: "50 %+", farbe: "#fab219", variable: "var(--warnung)",   ab: 50 },
  hoch:       { text: "Bald voll",       kurz: "75 %+", farbe: "#ec835a", variable: "var(--ernst)",     ab: 75 },
  voll:       { text: "Voll",            kurz: "90 %+", farbe: "#d03b3b", variable: "var(--kritisch)",  ab: 90 },
  unbekannt:  { text: "Keine Daten",     kurz: "?",     farbe: "#898781", variable: "var(--unbekannt)", ab: -1 },
};

export const STUFEN_REIHENFOLGE: Fuellstandsstufe[] = ["frei", "teilweise", "hoch", "voll", "unbekannt"];

export function stufeVon(prozent: number | null | undefined): Fuellstandsstufe {
  if (prozent === null || prozent === undefined) return "unbekannt";
  if (prozent >= 90) return "voll";
  if (prozent >= 75) return "hoch";
  if (prozent >= 50) return "teilweise";
  return "frei";
}

export function farbeVon(prozent: number | null | undefined): string {
  return STUFEN[stufeVon(prozent)].farbe;
}

export function prozentText(prozent: number | null | undefined): string {
  return prozent === null || prozent === undefined ? "–" : `${prozent} %`;
}

/** "vor 3 Std." / "vor 2 Tagen" - fuer das Alter einer Messung. */
export function alterText(zeitpunkt: string | null | undefined): string {
  if (!zeitpunkt) return "noch nie gemeldet";
  const ms = Date.now() - new Date(zeitpunkt).getTime();
  const minuten = Math.floor(ms / 60000);
  if (minuten < 2) return "gerade eben";
  if (minuten < 60) return `vor ${minuten} Min.`;
  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return `vor ${stunden} Std.`;
  const tage = Math.floor(stunden / 24);
  if (tage === 1) return "vor 1 Tag";
  if (tage < 31) return `vor ${tage} Tagen`;
  const monate = Math.floor(tage / 30);
  return monate === 1 ? "vor 1 Monat" : `vor ${monate} Monaten`;
}

/** Wie lange steht der Container schon am Standort? */
export function standzeitText(tage: number | null | undefined): string {
  if (tage === null || tage === undefined) return "unbekannt";
  if (tage < 31) return `${tage} Tage`;
  const monate = Math.round(tage / 30.44);
  if (monate < 24) return `${monate} Monate`;
  return `${(tage / 365.25).toFixed(1).replace(".", ",")} Jahre`;
}

/** Messwert gilt als veraltet, wenn er aelter als das doppelte Sendeintervall ist. */
export function istVeraltet(zeitpunkt: string | null | undefined, stundenGrenze = 30): boolean {
  if (!zeitpunkt) return true;
  return Date.now() - new Date(zeitpunkt).getTime() > stundenGrenze * 3600_000;
}

const DATUM = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const DATUM_ZEIT = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDatum(wert: string | null | undefined): string {
  return wert ? DATUM.format(new Date(wert)) : "–";
}

export function formatDatumZeit(wert: string | null | undefined): string {
  return wert ? DATUM_ZEIT.format(new Date(wert)) + " Uhr" : "–";
}

export function adresse(c: {
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
}): string {
  return [c.strasse, [c.plz, c.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}
