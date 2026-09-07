import { ZEITZONE, tagAlsZeitpunkt, tagStempel } from "./zeit";

/** ISO-Wochentage: 1 = Montag ... 7 = Sonntag - so rechnet auch Postgres. */
export const WOCHENTAGE: { wert: number; name: string; kurz: string }[] = [
  { wert: 1, name: "Montag", kurz: "Mo" },
  { wert: 2, name: "Dienstag", kurz: "Di" },
  { wert: 3, name: "Mittwoch", kurz: "Mi" },
  { wert: 4, name: "Donnerstag", kurz: "Do" },
  { wert: 5, name: "Freitag", kurz: "Fr" },
  { wert: 6, name: "Samstag", kurz: "Sa" },
  { wert: 7, name: "Sonntag", kurz: "So" },
];

export function wochentagName(wert: number): string {
  return WOCHENTAGE.find((w) => w.wert === wert)?.name ?? "–";
}

/** "jeden zweiten Dienstag" - der Rhythmus in einem Satz. */
export function rhythmusText(wochentag: number, intervallWochen: number): string {
  const tag = wochentagName(wochentag);
  if (intervallWochen <= 1) return `jeden ${tag}`;
  if (intervallWochen === 2) return `jeden zweiten ${tag}`;
  if (intervallWochen === 3) return `jeden dritten ${tag}`;
  if (intervallWochen === 4) return `jeden vierten ${tag}`;
  return `alle ${intervallWochen} Wochen ${tag}`;
}

/**
 * ISO-Wochentag eines Zeitpunkts - 1 = Montag.
 *
 * In deutscher Zeit, nicht in der des Geraets: getDay() haette denselben
 * Zeitpunkt je nach Zeiteinstellung des Browsers auf zwei verschiedene Tage
 * gelegt, und der Wochentag einer Regeltour darf nicht davon abhaengen, wer
 * gerade auf die Seite sieht.
 */
const WOCHENTAG_KURZ = new Intl.DateTimeFormat("en-US", { timeZone: ZEITZONE, weekday: "short" });
const WOCHENTAG_NUMMER: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

export function isoWochentag(datum: Date): number {
  return WOCHENTAG_NUMMER[WOCHENTAG_KURZ.format(datum)] ?? 1;
}

/**
 * Naechster Termin einer Regeltour ab einem Stichtag.
 *
 * Dieselbe Rechnung wie public.route_naechster_termin() in der Datenbank:
 * Ankerdatum plus volle Perioden bis zum Stichtag, aufgerundet, damit der
 * Stichtag selbst noch als Termin gilt.
 *
 * Sie stand wortgleich in /intern/routen/page.tsx und in
 * /intern/routen/[id]/page.tsx. Zwei Kopien derselben Formel laufen
 * auseinander, sobald jemand eine davon anfasst - und ein Terminfehler faellt
 * nicht auf, er verschiebt nur lautlos die Deckungsrechnung.
 */
export function naechsterTermin(
  ankerDatum: string,
  intervallWochen: number,
  ab: Date = new Date(),
): Date {
  // Beide Enden auf die Tagesmitte in UTC gelegt. Dadurch ist der Abstand
  // zwischen zwei Terminen immer ein glattes Vielfaches von 24 Stunden - die
  // 23- und die 25-Stunden-Nacht der Zeitumstellung koennen den Termin nicht
  // um einen Tag verschieben, und die Rechnung haengt an keiner
  // Zeiteinstellung.
  const stichtag = tagAlsZeitpunkt(tagStempel(ab));
  const anker = tagAlsZeitpunkt(ankerDatum);
  const periode = Math.max(1, intervallWochen) * 7 * 86400_000;
  const schritte = Math.max(0, Math.ceil((stichtag.getTime() - anker.getTime()) / periode));

  return new Date(anker.getTime() + schritte * periode);
}
