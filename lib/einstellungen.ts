/**
 * Lesen der Einstellungstabelle - bewusst ohne Datenbankabhängigkeit.
 *
 * Steht getrennt von lib/daten.ts, damit Module, die nur einen Zahlenwert
 * brauchen (etwa das Kostenmodell), nicht die ganze Supabase-Kette mitziehen.
 * Das ist keine Kosmetik: sonst lassen sich reine Rechenmodule nicht
 * eigenständig übersetzen und prüfen.
 */

/** Wert aus der Einstellungstabelle als Zahl, mit Rückfall auf den Standard. */
export function zahlAusEinstellung(
  werte: Record<string, unknown>,
  schluessel: string,
  standard: number,
): number {
  const wert = werte[schluessel];
  const zahl = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(zahl) ? zahl : standard;
}
