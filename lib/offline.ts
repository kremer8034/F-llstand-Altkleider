"use client";

/**
 * Warteschlange für Bestätigungen, die kein Netz erwischt haben.
 *
 * Im Flächenlandkreis gibt es Funklöcher, und ein Container steht selten dort,
 * wo der Empfang gut ist. Ohne Warteschlange hieße das: Fahrer bestätigt die
 * Leerung, es passiert nichts, er drückt nochmal, und wenn dann doch beides
 * ankommt, stehen zwei Leerungen in der Auswertung.
 *
 * Deshalb zwei Dinge, die zusammengehören:
 *
 *  1. **Hier**: jede Bestätigung landet zuerst im `localStorage` und gilt für
 *     die Oberfläche damit sofort als erledigt. Gesendet wird danach, und bei
 *     Misserfolg später erneut.
 *
 *  2. **In der Datenbank**: `tour_stopp_abschliessen()` ist wiederholbar
 *     (0015_touren.sql). Derselbe Aufruf zweimal ergibt denselben Zustand und
 *     keine zweite Leerung.
 *
 * Erst beides zusammen macht das Nachsenden gefahrlos. Eine Warteschlange
 * allein würde Dubletten erzeugen, sobald sie nicht sicher weiß, ob der erste
 * Versuch angekommen ist – und das weiß sie nie.
 *
 * Bewusst `localStorage` und nicht IndexedDB: es geht um ein paar Dutzend
 * kleine Einträge je Tour, und localStorage ist überall da, synchron und ohne
 * Aufbaukosten. Der Nachteil – alles muss durch JSON – wiegt hier nichts.
 */

export interface Auftrag {
  /** Eigene Kennung, damit derselbe Auftrag nicht doppelt in der Schlange steht. */
  id: string;
  stopp_id: string;
  container: { container_id: string; geleert: boolean; grund?: string }[];
  notiz: string | null;
  status: "erledigt" | "uebersprungen";
  /** Wann der Fahrer gedrückt hat – nicht, wann es ankam. */
  erfasst_am: string;
  versuche: number;
}

const SCHLUESSEL = "fuellstand.fahrer.warteschlange";

function lesen(): Auftrag[] {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (!roh) return [];
    const wert = JSON.parse(roh);
    return Array.isArray(wert) ? (wert as Auftrag[]) : [];
  } catch {
    // Beschädigter Inhalt darf die Fahrt nicht aufhalten.
    return [];
  }
}

function schreiben(auftraege: Auftrag[]): void {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(auftraege));
  } catch {
    // Voller oder gesperrter Speicher (privates Fenster): dann eben ohne
    // Warteschlange. Gesendet wird trotzdem, nur ohne zweiten Versuch.
  }
}

export function warteschlange(): Auftrag[] {
  return lesen();
}

/** Auftrag aufnehmen. Ein bereits vorhandener Stopp wird ersetzt, nicht ergänzt. */
export function einreihen(auftrag: Omit<Auftrag, "id" | "versuche">): Auftrag {
  const vollstaendig: Auftrag = {
    ...auftrag,
    id: `${auftrag.stopp_id}:${auftrag.erfasst_am}`,
    versuche: 0,
  };

  const alle = lesen().filter((a) => a.stopp_id !== auftrag.stopp_id);
  alle.push(vollstaendig);
  schreiben(alle);
  return vollstaendig;
}

export function entfernen(id: string): void {
  schreiben(lesen().filter((a) => a.id !== id));
}

export function versuchZaehlen(id: string): void {
  schreiben(lesen().map((a) => (a.id === id ? { ...a, versuche: a.versuche + 1 } : a)));
}

/**
 * Die Schlange abarbeiten.
 *
 * `senden` gibt zurück, ob der Auftrag angekommen ist. Nur dann fliegt er
 * raus – ein Fehler lässt ihn stehen, damit der nächste Versuch ihn wieder
 * aufnimmt. Nach der Reihe abgearbeitet, nicht nebenläufig: die Reihenfolge
 * der Stopps ist die Reihenfolge der Fahrt.
 */
export async function abarbeiten(
  senden: (auftrag: Auftrag) => Promise<boolean>,
): Promise<{ gesendet: number; offen: number }> {
  let gesendet = 0;

  for (const auftrag of lesen()) {
    let erfolg = false;
    try {
      erfolg = await senden(auftrag);
    } catch {
      erfolg = false;
    }

    if (erfolg) {
      entfernen(auftrag.id);
      gesendet++;
    } else {
      versuchZaehlen(auftrag.id);
    }
  }

  return { gesendet, offen: lesen().length };
}

/**
 * Die Tour für unterwegs ablegen.
 *
 * Wer im Funkloch die Seite neu lädt, bekommt sonst nichts – und weiß dann
 * nicht mehr, wo er hin sollte.
 */
export function tourAblegen(tourId: string, daten: unknown): void {
  try {
    localStorage.setItem(`fuellstand.fahrer.tour.${tourId}`, JSON.stringify(daten));
  } catch {
    // siehe oben
  }
}

export function tourHolen<T>(tourId: string): T | null {
  try {
    const roh = localStorage.getItem(`fuellstand.fahrer.tour.${tourId}`);
    return roh ? (JSON.parse(roh) as T) : null;
  } catch {
    return null;
  }
}
