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

/** ISO-Wochentag eines Datums - 1 = Montag. */
export function isoWochentag(datum: Date): number {
  const tag = datum.getDay();
  return tag === 0 ? 7 : tag;
}
