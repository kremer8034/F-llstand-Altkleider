/**
 * Zeitraeume fuer die Verlaufskurven auf der Containerseite.
 *
 * Sechs Vorauswahlen und ein frei gewaehltes Fenster. Jede Vorauswahl
 * beantwortet eine eigene Frage:
 *
 *   1 Tag    - was hat das Geraet heute gemeldet? Bei Minutentakt ist das
 *              die Aufloesung, in der man einem Versuch zusehen kann: Sensor
 *              umgelegt, Behaelter befuellt, Deckel zu.
 *   3 Tage   - haelt das, was gestern eingestellt wurde? Ein Wochenende.
 *   7 Tage   - was ist gerade los? Eine Fuellung von leer bis voll ist hier
 *              als Anstieg zu sehen, nicht als Strich.
 *   30 Tage  - der laufende Rhythmus: ein bis zwei Leerungen.
 *   90 Tage  - eine Jahreszeit. Hier faellt auf, wenn sich der Rhythmus
 *              verschiebt (Sommer/Winter, neuer Standort nebenan).
 *   1 Jahr   - der Bogen fuer die Batterie: ihr Abfall ist ueber Wochen
 *              nicht zu sehen, ueber ein Jahr dagegen eine klare Gerade.
 *
 * Dazu ein eigenes Fenster mit Von- und Bis-Datum. Es ersetzt die
 * Vorauswahlen nicht, sondern beantwortet die eine Frage, die keine von
 * ihnen kann: "was war am Dienstag letzter Woche?" Ein Zeitraum, der immer
 * an heute klebt, laesst sich nicht auf ein vergangenes Ereignis richten.
 *
 * Ein Tag ist dabei ein deutscher Tag - siehe lib/zeit.ts.
 */
import { ZEITZONE, tagStempel, tagesbeginn, tagesende } from "./zeit";

export interface Zeitraumvorgabe {
  schluessel: string;
  text: string;
  tage: number;
}

export const ZEITRAEUME: Zeitraumvorgabe[] = [
  { schluessel: "1t", text: "1 Tag", tage: 1 },
  { schluessel: "3t", text: "3 Tage", tage: 3 },
  { schluessel: "7t", text: "7 Tage", tage: 7 },
  { schluessel: "30t", text: "30 Tage", tage: 30 },
  { schluessel: "90t", text: "90 Tage", tage: 90 },
  { schluessel: "1j", text: "1 Jahr", tage: 365 },
];

export const ZEITRAUM_STANDARD = "30t";

/** Schluessel des frei gewaehlten Fensters - kein Eintrag in ZEITRAEUME. */
export const ZEITRAUM_EIGEN = "eigen";

/**
 * Ein aufgeloester Zeitraum: die beiden Enden stehen fest, nicht mehr eine
 * Zahl von Tagen. Beide Kurven und die Tabelle bekommen dieselben Werte, und
 * das Fenster haengt nur bei den Vorauswahlen an "jetzt".
 */
export interface Zeitraum {
  schluessel: string;
  text: string;
  von: Date;
  bis: Date;
  /** Von Hand gesetzt? Dann steht in der Adresse zusaetzlich von= und bis=. */
  eigen: boolean;
}

/**
 * So viele Punkte holt die Seite je Kurve aus der Datenbank. Etwas mehr als
 * die breiteste Kurve Pixel hat: dann liegt in jeder Bildspalte ein Wert und
 * es wird nichts sichtbar geglaettet, was es nicht auch wirklich gibt.
 */
export const MESSPUNKTE = 400;

const TAG_MS = 86400_000;

/** "2026-09-07" - fuer die Vorbelegung von <input type="date">. */
export const alsTagesfeld = tagStempel;

function vorgabeVon(schluessel: string | null | undefined): Zeitraumvorgabe {
  return (
    ZEITRAEUME.find((z) => z.schluessel === schluessel) ??
    (ZEITRAEUME.find((z) => z.schluessel === ZEITRAUM_STANDARD) as Zeitraumvorgabe)
  );
}

/**
 * Der Zeitraum aus der Adresse. `jetzt` wird einmal von aussen hereingereicht
 * und nicht hier geholt: beide Kurven sollen auf dieselbe Sekunde enden, nicht
 * auf zwei getrennte now().
 *
 * Ein unbrauchbares eigenes Fenster faellt still auf die Vorauswahl zurueck -
 * eine halb ausgefuellte Adresse ist kein Grund, dem Nutzer eine Fehlerseite
 * statt seiner Kurven zu zeigen. Vertauschte Enden werden getauscht statt
 * abgelehnt: "vom 7. bis zum 1." ist eine Eingabe, keine Frage.
 */
export function zeitraumAus(
  suche: { zeitraum?: string; von?: string; bis?: string },
  jetzt: Date,
): Zeitraum {
  if (suche.zeitraum === ZEITRAUM_EIGEN) {
    // Die Tagesgrenzen liegen in deutscher Zeit: "07.09." beginnt am 06.09.
    // um 22:00 UTC, nicht um Mitternacht UTC. Sonst fehlten dem gewaehlten
    // Tag die ersten zwei Stunden und die letzten zwei gehoerten dem
    // naechsten - im Minutentakt sind das 120 Messungen an der falschen
    // Stelle.
    let von = tagesbeginn(suche.von ?? "");
    let bis = tagesende(suche.bis ?? "");

    if (von && bis) {
      if (von > bis) [von, bis] = [tagesbeginn(suche.bis ?? "")!, tagesende(suche.von ?? "")!];
      return {
        schluessel: ZEITRAUM_EIGEN,
        text: `${tagText(von)} – ${tagText(bis)}`,
        von,
        bis,
        eigen: true,
      };
    }
  }

  const vorgabe = vorgabeVon(suche.zeitraum);
  return {
    schluessel: vorgabe.schluessel,
    text: vorgabe.text,
    von: new Date(jetzt.getTime() - vorgabe.tage * TAG_MS),
    bis: jetzt,
    eigen: false,
  };
}

const TAG = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function tagText(datum: Date): string {
  return TAG.format(datum);
}

/**
 * "letzte 30 Tage" bzw. "01.09.2026 – 07.09.2026" - fuer Ueberschriften,
 * damit dort der gewaehlte Zeitraum steht und nicht nur das Wort "Verlauf".
 */
export function zeitraumText(zeitraum: Zeitraum): string {
  if (zeitraum.eigen) return zeitraum.text;
  if (zeitraum.schluessel === "1j") return "letztes Jahr";
  if (zeitraum.schluessel === "1t") return "letzte 24 Stunden";
  return `letzte ${zeitraum.text}`;
}
