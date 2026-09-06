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
  /**
   * Eingesammelte Menge in **Containerfüllungen**.
   *
   * Drei Container zu 80 % sind 2,4 Füllungen. Seit 0022 führen wir kein
   * Volumen je Container mehr; mit einem Einheitsvolumen weiterzurechnen hätte
   * eine Genauigkeit vorgetäuscht, die es nie gab. Die Füllung ist die
   * Einheit, die wir wirklich messen - und für den Vergleich von Stopps tut
   * sie genau dasselbe wie der Liter.
   */
  ertragFuellungen: number;
  /** Die Kennzahl, mit der Stopps vergleichbar werden – null ohne Ertrag. */
  euroJeFuellung: number | null;
}

/**
 * Kosten eines einzelnen Stopps.
 *
 * `ertragFuellungen` ist die Menge, die dort eingesammelt wird – also der
 * gefüllte Anteil, nicht die Kapazität. Ohne Ertrag gibt es keine Kennzahl:
 * durch null zu teilen wäre eine erfundene Unendlichkeit.
 */
export function stoppKosten(
  eingabe: { umwegKm: number; containerAnzahl: number; ertragFuellungen: number },
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
    ertragFuellungen: eingabe.ertragFuellungen,
    euroJeFuellung: eingabe.ertragFuellungen > 0 ? kosten / eingabe.ertragFuellungen : null,
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

export function kennzahlText(euroJeFuellung: number | null | undefined): string {
  return euroJeFuellung === null || euroJeFuellung === undefined || !Number.isFinite(euroJeFuellung)
    ? "–"
    : `${EURO_FEIN.format(euroJeFuellung)} je Füllung`;
}

/**
 * Der Durchschnitt über die Stopps, die ohnehin gefahren werden.
 *
 * Er ist der Maßstab, an dem sich ein einzelner Stopp messen lässt: „2,96 €"
 * sagt für sich genommen nichts, „2,96 € gegen 0,41 € im Schnitt" schon.
 * Gewichtet nach Menge, sonst zieht ein winziger Stopp den Schnitt hoch.
 */
export function tourdurchschnitt(stopps: Stoppkosten[]): number | null {
  const brauchbar = stopps.filter((s) => s.euroJeFuellung !== null && s.ertragFuellungen > 0);
  if (brauchbar.length === 0) return null;

  const kosten = brauchbar.reduce((s, k) => s + k.kosten, 0);
  const fuellungen = brauchbar.reduce((s, k) => s + k.ertragFuellungen, 0);
  return fuellungen > 0 ? kosten / fuellungen : null;
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
  if (stopp.euroJeFuellung === null || durchschnitt === null || durchschnitt <= 0) return false;
  return stopp.euroJeFuellung > durchschnitt * TEUER_FAKTOR;
}
