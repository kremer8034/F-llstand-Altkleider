/**
 * Eine Zeitzone fuer die ganze Anlage: Europe/Berlin.
 *
 * Vorher gab es keine. Die Container laufen ohne TZ, also in UTC, und die
 * Oberflaeche wird auf dem Server gerendert - eine Meldung von 12:16 Uhr
 * deutscher Zeit stand deshalb als "10:16 Uhr" auf der Seite. Aufgefallen ist
 * das am 07.09.2026 an einer Meldung, deren Zeitstempel zwei Stunden vor dem
 * lag, was der Betreiber getan hatte.
 *
 * Die Zone gehoert an zwei Stellen gesetzt, und beide werden gebraucht:
 *
 *   TZ=Europe/Berlin in docker-compose.yml   fuer alles, was der Server
 *   nebenbei mit Datumsangaben tut - Protokolle, Date-Rechnungen, die
 *   Datenbanksitzung.
 *
 *   ZEITZONE hier, ausdruecklich an jedem Formatierer  fuer alles, was
 *   ANGEZEIGT wird. Ein Teil der Oberflaeche laeuft im Browser, und dort gilt
 *   TZ nicht, sondern die Einstellung des Geraets. Ohne ausdrueckliche Zone
 *   stuende auf einem Rechner mit anderer Zeiteinstellung eine andere Uhrzeit
 *   als auf dem Server - und React wuerde beim Abgleich der Serverausgabe mit
 *   der ersten Browserdarstellung darueber stolpern.
 *
 * Bewusst fest verdrahtet und nicht als Einstellung: die Anlage wird von einem
 * Kreisverband in Unterfranken betrieben. Eine Zeitzone, die man verstellen
 * kann, ist eine Zeitzone, die irgendwann falsch steht.
 */
export const ZEITZONE = "Europe/Berlin";

/** "2026-09-07" - das Muster von <input type="date"> und der date-Spalten. */
const TAG_MUSTER = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Der Tagesstempel eines Zeitpunkts, in deutscher Zeit.
 *
 * "en-CA" ist hier kein Versehen: dieses Gebietsschema schreibt Daten von Haus
 * aus als YYYY-MM-DD, und genau das brauchen ein date-Feld, eine date-Spalte
 * und jeder Vergleich zweier Tage. Der Umweg ueber toISOString() lieferte
 * stattdessen den UTC-Tag - abends nach 22 Uhr also den falschen.
 */
const TAGESSTEMPEL = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZEITZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function tagStempel(zeitpunkt: Date = new Date()): string {
  return TAGESSTEMPEL.format(zeitpunkt);
}

/** Heute in deutscher Zeit, als "2026-09-07". */
export function heute(): string {
  return tagStempel(new Date());
}

const FELDER = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZEITZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/**
 * Wie weit geht die deutsche Uhr zu diesem Zeitpunkt der UTC voraus? In
 * Minuten, also +60 im Winter und +120 in der Sommerzeit.
 */
function versatzMinuten(zeitpunkt: Date): number {
  const teil: Record<string, string> = {};
  for (const t of FELDER.formatToParts(zeitpunkt)) teil[t.type] = t.value;

  const alsWaereEsUtc = Date.UTC(
    Number(teil.year),
    Number(teil.month) - 1,
    Number(teil.day),
    // Mitternacht meldet dieses Gebietsschema als 24 Uhr des Vortages.
    Number(teil.hour) % 24,
    Number(teil.minute),
    Number(teil.second),
  );

  return (alsWaereEsUtc - Math.floor(zeitpunkt.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Ein Zeitpunkt aus deutscher Ortszeit.
 *
 * Zwei Durchgaenge, und der zweite ist der Grund, warum das hier steht statt
 * als Einzeiler an der Aufrufstelle: der Versatz haengt vom Zeitpunkt ab, den
 * man erst ausrechnen will. In den beiden Umstellungsnaechten liegt der erste
 * Schaetzwert daneben, der zweite trifft. Die Tagesgrenzen selbst sind davon
 * nie betroffen - umgestellt wird um 02:00 Uhr, nicht um Mitternacht.
 */
function ausOrtszeit(
  jahr: number,
  monat: number,
  tag: number,
  stunde: number,
  minute: number,
  sekunde: number,
  ms: number,
): Date {
  const alsWaereEsUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute, sekunde, ms);
  const erster = new Date(alsWaereEsUtc - versatzMinuten(new Date(alsWaereEsUtc)) * 60_000);
  return new Date(alsWaereEsUtc - versatzMinuten(erster) * 60_000);
}

/**
 * Der Beginn eines Tages in deutscher Zeit - "2026-09-07" wird zum 06.09. um
 * 22:00 UTC. Null bei allem, was kein Tag ist: falsches Muster, aber auch der
 * 29.02. eines Jahres ohne Schalttag, den Date sonst stillschweigend zum
 * 1. Maerz macht.
 */
export function tagesbeginn(tag: string): Date | null {
  if (!TAG_MUSTER.test(tag)) return null;
  const [jahr, monat, tagImMonat] = tag.split("-").map(Number);
  const zeitpunkt = ausOrtszeit(jahr, monat, tagImMonat, 0, 0, 0, 0);
  return tagStempel(zeitpunkt) === tag ? zeitpunkt : null;
}

/** Das Ende eines Tages in deutscher Zeit, letzte Millisekunde eingeschlossen. */
export function tagesende(tag: string): Date | null {
  if (!TAG_MUSTER.test(tag)) return null;
  const [jahr, monat, tagImMonat] = tag.split("-").map(Number);
  const zeitpunkt = ausOrtszeit(jahr, monat, tagImMonat, 23, 59, 59, 999);
  return tagStempel(zeitpunkt) === tag ? zeitpunkt : null;
}

/**
 * Ein Tagesstempel als Zeitpunkt zum Anzeigen - die Tagesmitte in UTC.
 *
 * Fuer date-Spalten ohne Uhrzeit (tour.datum, anker_datum): sie sollen nur
 * ihren Wochentag und ihr Datum hergeben. 12:00 UTC ist in Berlin 13 bzw.
 * 14 Uhr und damit sicher derselbe Tag - anders als "T12:00:00" ohne Zone,
 * das je nach Geraet des Betrachters ausgelegt wird.
 */
export function tagAlsZeitpunkt(tag: string): Date {
  return new Date(`${tag}T12:00:00Z`);
}
