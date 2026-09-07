/**
 * Zeitraeume fuer die Verlaufskurven auf der Containerseite.
 *
 * Vier Vorauswahlen, und zwar diese vier, weil sie je eine eigene Frage
 * beantworten:
 *
 *   7 Tage   - was ist gerade los? Eine Fuellung von leer bis voll ist hier
 *              als Anstieg zu sehen, nicht als Strich.
 *   30 Tage  - der Blick, der bis hierher fest eingebaut war: ein bis zwei
 *              Leerungen, also der laufende Rhythmus.
 *   90 Tage  - eine Jahreszeit. Hier faellt auf, wenn sich der Rhythmus
 *              verschiebt (Sommer/Winter, neuer Standort nebenan).
 *   1 Jahr   - der Bogen fuer die Batterie: ihr Abfall ist ueber Wochen
 *              nicht zu sehen, ueber ein Jahr dagegen eine klare Gerade.
 *
 * Mehr Stufen dazwischen (24 Stunden, 6 Monate) waeren eine Reihe zum
 * Durchklicken statt einer Entscheidung; weniger liesse eine der vier Fragen
 * unbeantwortet.
 */
export interface Zeitraum {
  schluessel: string;
  text: string;
  tage: number;
}

export const ZEITRAEUME: Zeitraum[] = [
  { schluessel: "7t", text: "7 Tage", tage: 7 },
  { schluessel: "30t", text: "30 Tage", tage: 30 },
  { schluessel: "90t", text: "90 Tage", tage: 90 },
  { schluessel: "1j", text: "1 Jahr", tage: 365 },
];

export const ZEITRAUM_STANDARD = "30t";

/**
 * So viele Punkte holt die Seite je Kurve aus der Datenbank. Etwas mehr als
 * die breiteste Kurve Pixel hat: dann liegt in jeder Bildspalte ein Wert und
 * es wird nichts sichtbar geglaettet, was es nicht auch wirklich gibt.
 */
export const MESSPUNKTE = 400;

/** Unbekannter oder fehlender Wert faellt auf die 30 Tage zurueck. */
export function zeitraumVon(schluessel: string | null | undefined): Zeitraum {
  return (
    ZEITRAEUME.find((z) => z.schluessel === schluessel) ??
    (ZEITRAEUME.find((z) => z.schluessel === ZEITRAUM_STANDARD) as Zeitraum)
  );
}

/** "letzte 30 Tage" - fuer Ueberschriften, damit dort der gewaehlte Wert steht. */
export function zeitraumText(zeitraum: Zeitraum): string {
  return zeitraum.tage === 365 ? "letztes Jahr" : `letzte ${zeitraum.text}`;
}
