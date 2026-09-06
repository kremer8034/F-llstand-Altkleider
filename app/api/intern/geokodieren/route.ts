import { NextResponse } from "next/server";
import { angemeldeterBenutzer } from "@/lib/auth";

/**
 * Adresse zu Koordinaten - ueber Nominatim (OpenStreetMap).
 *
 * Warum ueber den eigenen Server und nicht aus dem Browser:
 *
 *   * Nominatims Nutzungsregeln verlangen eine erkennbare Kennung und
 *     hoechstens eine Anfrage je Sekunde. Aus vielen Browsern heraus ist
 *     beides nicht zu halten - und gesperrt wird dann die Adresse des
 *     Nutzers, nicht unsere.
 *   * Die Anschrift eines Platzes geht damit nur von hier nach draussen, an
 *     einer Stelle, die man kennt und abschalten kann.
 *
 * Nur fuer Angemeldete. Ein offener Geokodierer waere ein Weiterleitungsdienst
 * fuer beliebige Adressen auf fremde Kosten.
 */

/**
 * Eine Anfrage je Sekunde, prozessweit - so steht es in Nominatims Regeln.
 *
 * Als blosser Zeitstempel reichte das nicht: zwei gleichzeitige Anfragen lasen
 * denselben alten Wert, warteten dieselbe Spanne und gingen anschliessend
 * zusammen raus. Die Bremse griff genau dann nicht, wenn sie gebraucht wurde.
 * Deshalb eine Warteschlange - jede Anfrage haengt sich an die vorige an.
 */
let zuletzt = 0;
const MINDESTABSTAND_MS = 1100;
let warteschlange: Promise<void> = Promise.resolve();

function anDerReihe(): Promise<void> {
  warteschlange = warteschlange.then(async () => {
    const wartezeit = Math.max(0, zuletzt + MINDESTABSTAND_MS - Date.now());
    if (wartezeit > 0) await new Promise((fertig) => setTimeout(fertig, wartezeit));
    zuletzt = Date.now();
  });
  return warteschlange;
}

interface Treffer {
  anzeige: string;
  lat: number;
  lng: number;
}

export async function GET(anfrage: Request) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) {
    return NextResponse.json({ fehler: "Nicht angemeldet." }, { status: 401 });
  }

  const adresse = new URL(anfrage.url).searchParams.get("adresse")?.trim() ?? "";
  if (adresse.length < 3) {
    return NextResponse.json({ fehler: "Bitte eine Adresse angeben." }, { status: 400 });
  }

  await anDerReihe();

  const ziel = new URL("https://nominatim.openstreetmap.org/search");
  ziel.searchParams.set("q", adresse);
  ziel.searchParams.set("format", "jsonv2");
  ziel.searchParams.set("limit", "5");
  // Der Landkreis liegt in Deutschland; das haelt Treffer aus aller Welt raus.
  ziel.searchParams.set("countrycodes", "de");
  ziel.searchParams.set("accept-language", "de");

  try {
    const antwort = await fetch(ziel, {
      headers: {
        // Nominatim verlangt eine Kennung, an der ein Betreiber uns erreichen
        // kann. Ohne sie wird die Anfrage abgewiesen.
        "User-Agent": `Fuellstand Altkleider (${process.env.NEXT_PUBLIC_SITE_URL ?? "selbst betrieben"})`,
        Accept: "application/json",
      },
      // Der Nutzer wartet vor dem Formular - lieber ein Fehler als ein Hänger.
      signal: AbortSignal.timeout(8000),
    });

    if (!antwort.ok) {
      return NextResponse.json(
        { fehler: "Die Adresssuche antwortet gerade nicht." },
        { status: 503 },
      );
    }

    const roh = (await antwort.json()) as { display_name?: string; lat?: string; lon?: string }[];
    const treffer: Treffer[] = roh
      .map((t) => ({
        anzeige: t.display_name ?? "",
        lat: Number(t.lat),
        lng: Number(t.lon),
      }))
      .filter((t) => t.anzeige !== "" && Number.isFinite(t.lat) && Number.isFinite(t.lng));

    return NextResponse.json({ treffer });
  } catch {
    return NextResponse.json(
      { fehler: "Die Adresssuche war nicht erreichbar." },
      { status: 503 },
    );
  }
}
