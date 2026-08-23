import { zahlAusEinstellung } from "./einstellungen";

/**
 * Was ein Stopp kostet – Personal und Sachkosten.
 *
 * Gerechnet werden **Umwegkosten**, nicht Gesamtkosten: nicht was die Fahrt zu
 * diesem Standort kostet, sondern was es kostet, ihn zusätzlich in die ohnehin
 * geplante Route zu hängen. Den Umweg liefert `umwegKm()` aus lib/route.ts.
 *
 * Warum das hier steht und nicht in der Datenbank: der Umweg hängt von der
 * geplanten Reihenfolge ab, und die entsteht erst in der Oberfläche. Die
 * Datenbank liefert die Tatsachen (Ertrag, Containerzahl, Dringlichkeit), die
 * Route liefert den Umweg, und hier kommt beides zusammen.
 *
 * Siehe docs/tourenplanung.md, Abschnitt 3.
 */

export interface Kostensaetze {
  /** Sprit, Verschleiß, Reifen, Wartung – Euro je Kilometer. */
  proKm: number;
  /** Fahrpersonal einschließlich Lohnnebenkosten – Euro je Stunde. */
  proStunde: number;
  /** Feste Zeit am Standort: anhalten, aufschließen, sichern. */
  minutenJeStopp: number;
  /** Zeit je Container. */
  minutenJeContainer: number;
  /** Reisegeschwindigkeit für die Zeitrechnung. */
  kmh: number;
}

export const KOSTEN_STANDARD: Kostensaetze = {
  proKm: 0.8,
  proStunde: 45,
  minutenJeStopp: 8,
  minutenJeContainer: 4,
  kmh: 45,
};

/** Kostensätze aus der Einstellungstabelle lesen, mit den Standardwerten als Rückfall. */
export function kostensaetzeAus(werte: Record<string, unknown>): Kostensaetze {
  return {
    proKm: zahlAusEinstellung(werte, "kosten_pro_km", KOSTEN_STANDARD.proKm),
    proStunde: zahlAusEinstellung(werte, "kosten_pro_stunde", KOSTEN_STANDARD.proStunde),
    minutenJeStopp: zahlAusEinstellung(werte, "minuten_je_stopp", KOSTEN_STANDARD.minutenJeStopp),
    minutenJeContainer: zahlAusEinstellung(
      werte,
      "minuten_je_container",
      KOSTEN_STANDARD.minutenJeContainer,
    ),
    kmh: zahlAusEinstellung(werte, "durchschnitt_kmh", KOSTEN_STANDARD.kmh),
  };
}

export interface Stoppkosten {
  /** Umweg in Kilometern. */
  umwegKm: number;
  /** Fahrzeit plus Standzeit in Minuten. */
  zeitMinuten: number;
  /** Anteil Sachkosten. */
  fahrtkosten: number;
  /** Anteil Personalkosten. */
  zeitkosten: number;
  /** Summe. */
  kosten: number;
  /** Eingesammelte Menge in Litern. */
  ertragLiter: number;
  /** Die Kennzahl, mit der Stopps vergleichbar werden – null ohne Ertrag. */
  euroJe100Liter: number | null;
}

/**
 * Kosten eines einzelnen Stopps.
 *
 * `ertragLiter` ist die Menge, die dort eingesammelt wird – also der gefüllte
 * Anteil, nicht die Kapazität. Ohne Ertrag gibt es keine Kennzahl: durch null
 * zu teilen wäre eine erfundene Unendlichkeit.
 */
export function stoppKosten(
  eingabe: { umwegKm: number; containerAnzahl: number; ertragLiter: number },
  saetze: Kostensaetze,
): Stoppkosten {
  const umweg = Math.max(0, eingabe.umwegKm);
  const fahrzeit = saetze.kmh > 0 ? (umweg / saetze.kmh) * 60 : 0;
  const standzeit = saetze.minutenJeStopp + eingabe.containerAnzahl * saetze.minutenJeContainer;
  const zeitMinuten = fahrzeit + standzeit;

  const fahrtkosten = umweg * saetze.proKm;
  const zeitkosten = (zeitMinuten / 60) * saetze.proStunde;
  const kosten = fahrtkosten + zeitkosten;

  return {
    umwegKm: umweg,
    zeitMinuten,
    fahrtkosten,
    zeitkosten,
    kosten,
    ertragLiter: eingabe.ertragLiter,
    euroJe100Liter: eingabe.ertragLiter > 0 ? kosten / (eingabe.ertragLiter / 100) : null,
  };
}

const EURO = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const EURO_FEIN = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
});

export function euroText(wert: number | null | undefined): string {
  return wert === null || wert === undefined || !Number.isFinite(wert) ? "–" : EURO.format(wert);
}

export function kennzahlText(euroJe100Liter: number | null | undefined): string {
  return euroJe100Liter === null || euroJe100Liter === undefined || !Number.isFinite(euroJe100Liter)
    ? "–"
    : `${EURO_FEIN.format(euroJe100Liter)} je 100 l`;
}

/**
 * Der Durchschnitt über die Stopps, die ohnehin gefahren werden.
 *
 * Er ist der Maßstab, an dem sich ein einzelner Stopp messen lässt: „2,96 €"
 * sagt für sich genommen nichts, „2,96 € gegen 0,41 € im Schnitt" schon.
 * Gewichtet nach Menge, sonst zieht ein winziger Stopp den Schnitt hoch.
 */
export function tourdurchschnitt(stopps: Stoppkosten[]): number | null {
  const brauchbar = stopps.filter((s) => s.euroJe100Liter !== null && s.ertragLiter > 0);
  if (brauchbar.length === 0) return null;

  const kosten = brauchbar.reduce((s, k) => s + k.kosten, 0);
  const liter = brauchbar.reduce((s, k) => s + k.ertragLiter, 0);
  return liter > 0 ? kosten / (liter / 100) : null;
}

/**
 * Lohnt sich der Stopp?
 *
 * Bewusst kein fester Grenzwert in Euro: was teuer ist, hängt vom Landkreis und
 * von der Tour ab. Verglichen wird deshalb mit dem Durchschnitt der Tour – wer
 * mehr als das Dreifache kostet, fällt auf.
 */
export const TEUER_FAKTOR = 3;

export function istTeuer(stopp: Stoppkosten, durchschnitt: number | null): boolean {
  if (stopp.euroJe100Liter === null || durchschnitt === null || durchschnitt <= 0) return false;
  return stopp.euroJe100Liter > durchschnitt * TEUER_FAKTOR;
}
