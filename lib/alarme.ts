import type { Alarmtyp, Fuellstandsstufe } from "./typen";
import { formatDatumZeit } from "./fuellstand";

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

/**
 * Wann eine Meldung von selbst endet.
 *
 * Jede dieser Meldungen schliesst sich ohne Zutun, sobald ihr Grund weg ist -
 * die Anlage prueft das bei jeder eingehenden Messung (messung_nachbereiten,
 * 0026/0027). Nur stand das nirgends, und am 07.09.2026 fuehrte genau das zu
 * der Frage, ob eine Meldung von 10:16 Uhr noch gilt oder nur nicht
 * weggeraeumt wurde. Sie galt: der Sensor lag zu dieser Minute noch schief.
 *
 * Deshalb steht die Bedingung jetzt an der Meldung. Sie beantwortet zwei
 * Fragen auf einmal: "verschwindet das von allein?" (ja) und "was muss dafuer
 * passieren?" - und macht damit umgekehrt klar, dass eine Meldung, die noch
 * dasteht, auch noch besteht.
 */
export const ALARM_ENDET: Record<Alarmtyp, string> = {
  fuellstand: "Endet von selbst, sobald der Füllstand wieder unter die Warnschwelle fällt – in der Regel mit der nächsten Leerung.",
  kein_signal: "Endet von selbst mit der nächsten Meldung des Geräts.",
  batterie_schwach: "Endet von selbst, sobald wieder ein Wert über der Schwelle gemeldet wird.",
  messfehler: "Endet von selbst, sobald wieder eine brauchbare Messung ankommt.",
  sensor_lage: "Endet von selbst, sobald das Gerät wieder „gerade“ meldet.",
  ausser_messbereich: "Endet von selbst, sobald der Sensor wieder einen Abstand innerhalb seines Messbereichs liefert.",
};

/**
 * "Besteht seit 07.09.2026 10:16 Uhr · seit 5 Std."
 *
 * Beide Seiten werden gebraucht und keine reicht allein: der Zeitpunkt, um die
 * Meldung mit dem in Verbindung zu bringen, was man an dem Tag getan hat, und
 * die Dauer, weil "seit 5 Std." sofort sagt, was ein Datum erst nach einer
 * Kopfrechnung sagt. Angezeigt werden ohnehin nur offene Meldungen - das
 * "Besteht" ist deshalb keine Behauptung, sondern die Auskunft, die vorher
 * fehlte.
 */
export function alarmZeitraumText(ausgeloestAm: string, jetzt: Date = new Date()): string {
  return `Besteht seit ${formatDatumZeit(ausgeloestAm)} · seit ${dauerText(ausgeloestAm, jetzt)}`;
}

/** "12 Min." / "5 Std." / "3 Tagen" - die Laenge einer noch laufenden Meldung. */
export function dauerText(seit: string, jetzt: Date = new Date()): string {
  const minuten = Math.max(0, Math.floor((jetzt.getTime() - new Date(seit).getTime()) / 60_000));
  if (minuten < 60) return `${minuten} Min.`;
  const stunden = Math.floor(minuten / 60);
  if (stunden < 48) return `${stunden} Std.`;
  const tage = Math.floor(stunden / 24);
  if (tage < 61) return `${tage} Tagen`;
  return `${Math.floor(tage / 30.44)} Monaten`;
}
