import type { Alarmtyp, Fuellstandsstufe } from "./typen";

/**
 * Wie eine Meldung heisst und wie ernst sie aussieht.
 *
 * Beides stand vorher zweimal da - auf der Uebersicht als Tabelle, auf der
 * Containerseite als Reihe von Fragezeichen im JSX ("typ === 'fuellstand' ?
 * ... : ..."). Ein neuer Meldungstyp erschien deshalb an der einen Stelle mit
 * Namen und an der anderen als roher Datenbankwert. Jetzt gibt es eine
 * Quelle, und TypeScript besteht auf Vollstaendigkeit: wer den Enum in
 * lib/typen.ts erweitert, kommt hier nicht vorbei.
 *
 * Was die einzelnen Meldungen ausloest, steht in 0026_meldungen.sql und
 * 0027_nichts_im_messbereich.sql.
 */
export const ALARM_TEXT: Record<Alarmtyp, string> = {
  fuellstand: "Container voll",
  kein_signal: "Kein Signal",
  batterie_schwach: "Batterie schwach",
  messfehler: "Keine brauchbaren Messwerte",
  sensor_lage: "Sensor verrutscht",
  ausser_messbereich: "Nichts im Messbereich",
};

/**
 * Was zu tun ist. Die Meldung selbst nennt den Befund; hier steht, was er
 * fuer den Betrieb bedeutet - der Unterschied zwischen "Batterie schwach"
 * (Zellen mitnehmen) und "Sensor verrutscht" (Schraubenschluessel mitnehmen)
 * entscheidet, was ins Auto gehoert, bevor jemand losfaehrt.
 */
export const ALARM_HINWEIS: Record<Alarmtyp, string> = {
  fuellstand: "Auf die nächste Tour nehmen.",
  kein_signal: "Gerät prüfen: Batterie leer, Antenne oder Funkloch.",
  batterie_schwach: "Zellen tauschen, bevor das Gerät ausfällt.",
  messfehler:
    "Das Gerät meldet sich, misst aber nichts Brauchbares – Sicht auf den Boden frei? Sensor richtig eingebaut?",
  sensor_lage: "Verschraubung im Deckel nachziehen – das Gerät hängt schief.",
  ausser_messbereich:
    "Etwas steht direkt vor dem Sensor: randvoller Behälter, verdeckte oder heruntergefallene Sonde. Vor Ort ansehen.",
};

/**
 * Die Stufe bestimmt Farbe UND Form des Symbols (siehe lib/fuellstand.ts).
 *
 * "voll" nur fuer den vollen Container - das ist die einzige Meldung, die
 * eine Fahrt ausloest. Alles, was Werkzeug braucht, ist "hoch"; was nur
 * bedeutet, dass wir gerade nichts wissen, ist "unbekannt".
 */
export const ALARM_STUFE: Record<Alarmtyp, Fuellstandsstufe> = {
  fuellstand: "voll",
  kein_signal: "unbekannt",
  batterie_schwach: "hoch",
  messfehler: "hoch",
  sensor_lage: "hoch",
  ausser_messbereich: "hoch",
};
