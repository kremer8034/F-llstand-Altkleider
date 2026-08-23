import type { ContainerPrognose, ContainerRhythmus, Prognosegrundlage } from "./typen";

/**
 * Darstellung von Prognose und Leerungsrhythmus.
 *
 * Gerechnet wird in der Datenbank (siehe 0010_prognose.sql), hier steht nur,
 * wie die Zahlen heissen und wie sie geschrieben werden. Zwei Grundsaetze:
 *
 *  - Eine Prognose ohne Grundlage wird nicht gezeigt, sondern benannt. "In
 *    3 Tagen" aus einer einzigen Messung waere eine erfundene Genauigkeit.
 *  - Wo eine Zahl steht, steht auch, worauf sie beruht. Wer danach eine Tour
 *    plant, soll wissen, ob dahinter zwei Wochen Messung stehen oder eine
 *    grobe Erfahrung.
 */

/** Zahl robust lesen: PostgREST liefert numeric je nach Version als Zahl oder Text. */
function zahl(wert: number | string | null | undefined): number | null {
  if (wert === null || wert === undefined) return null;
  const n = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(n) ? n : null;
}

const WOCHENTAG_DATUM = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

/** "Fr., 12.09." - fuer ein Prognosedatum reicht der Tag, die Uhrzeit taeuscht Genauigkeit vor. */
export function prognoseDatum(wert: string | null | undefined): string {
  return wert ? WOCHENTAG_DATUM.format(new Date(wert)) : "–";
}

/** "heute" / "morgen" / "in 5 Tagen" / "überfällig" */
export function tageText(tage: number | string | null | undefined): string {
  const t = zahl(tage);
  if (t === null) return "–";
  if (t <= 0.5) return "heute";
  if (t < 1.5) return "morgen";
  return `in ${Math.round(t)} Tagen`;
}

/** "alle 20 Tage" - die Kennzahl in Worten. */
export function rhythmusText(mittelTage: number | string | null | undefined): string {
  const t = zahl(mittelTage);
  if (t === null) return "noch kein Rhythmus";
  if (t < 1.5) return "täglich";
  if (t < 10.5) return `alle ${t.toFixed(1).replace(".", ",")} Tage`;
  return `alle ${Math.round(t)} Tage`;
}

/** "19× im Jahr" */
export function jahresText(proJahr: number | string | null | undefined): string {
  const n = zahl(proJahr);
  return n === null ? "–" : `${Math.round(n)}× im Jahr`;
}

/**
 * Wie verlaesslich ist der Rhythmus?
 *
 * Streuung im Verhaeltnis zum Mittelwert: liegen die Abstaende dicht
 * beieinander, traegt der Mittelwert; streuen sie stark, ist er nur ein
 * Anhaltspunkt. Unter drei Abstaenden wird gar nicht erst geurteilt.
 */
export function rhythmusGuete(r: Pick<ContainerRhythmus, "abstaende_anzahl" | "mittel_tage" | "streuung_tage">): {
  stufe: "gut" | "schwankend" | "duenn";
  text: string;
} {
  const anzahl = zahl(r.abstaende_anzahl) ?? 0;
  const mittel = zahl(r.mittel_tage);
  const streuung = zahl(r.streuung_tage);

  if (anzahl < 3 || mittel === null) {
    return { stufe: "duenn", text: `aus ${anzahl} ${anzahl === 1 ? "Abstand" : "Abständen"} – noch dünn` };
  }
  if (streuung !== null && mittel > 0 && streuung / mittel > 0.4) {
    return { stufe: "schwankend", text: `schwankt stark (± ${Math.round(streuung)} Tage)` };
  }
  return {
    stufe: "gut",
    text: streuung === null ? `aus ${anzahl} Abständen` : `± ${streuung.toFixed(1).replace(".", ",")} Tage`,
  };
}

export const GRUNDLAGE_TEXT: Record<Prognosegrundlage, string> = {
  messung_und_historie: "Messreihe und bisheriger Rhythmus",
  messung: "Messreihe seit der letzten Leerung",
  historie: "bisheriger Leerungsrhythmus",
  keine: "keine ausreichende Grundlage",
};

export const GRUNDLAGE_KURZ: Record<Prognosegrundlage, string> = {
  messung_und_historie: "Messung + Historie",
  messung: "nur Messung",
  historie: "nur Historie",
  keine: "keine Daten",
};

/** Steht eine belastbare Prognose zur Verfuegung? */
export function hatPrognose(p: Pick<ContainerPrognose, "tage_bis_tour" | "grundlage"> | null | undefined): boolean {
  return !!p && p.grundlage !== "keine" && zahl(p.tage_bis_tour) !== null;
}

/**
 * Warum steht keine Prognose da? Der Satz erscheint anstelle der Zahl - so
 * weiss man, was fehlt, statt vor einem Strich zu stehen.
 */
export function prognoseFehlt(
  p: ContainerPrognose | null | undefined,
  r: ContainerRhythmus | null | undefined,
): string {
  if (!p || p.grundlage === "keine") {
    if (!r || r.leerungen_gesamt === 0) {
      return "Noch keine Leerung erfasst und zu wenige Messungen – die Hochrechnung braucht eins von beidem.";
    }
    return "Zu wenige Messungen im laufenden Zyklus und noch kein Rhythmus aus mindestens zwei Leerungen.";
  }
  if (zahl(p.rate_prozent_pro_tag) === null) {
    return "Der Füllstand steigt derzeit nicht messbar – daraus lässt sich kein Zeitpunkt ableiten.";
  }
  if (p.fuellstand_prozent === null) {
    return "Für diesen Container liegt kein aktueller Füllstand vor.";
  }
  return "Für eine Hochrechnung reichen die Daten noch nicht.";
}

/** "5,0 %-Punkte am Tag" */
export function rateText(rate: number | string | null | undefined): string {
  const n = zahl(rate);
  return n === null ? "–" : `${n.toFixed(1).replace(".", ",")} %-Punkte am Tag`;
}

export { zahl as prognoseZahl };
