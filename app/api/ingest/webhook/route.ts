import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ausMeldung } from "@/lib/dekoder/milesight";
import { messungSpeichern, sensorZuKennung } from "@/lib/messung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Zweiter Annahmeweg: Fertiggeraete.
 *
 * Der Eigenbau signiert jede Meldung mit einem eigenen Geraetegeheimnis
 * (/api/ingest). Ein gekauftes Geraet kann das nicht - es kennt unser
 * Verfahren nicht und laesst sich nicht dazu bringen, es zu lernen. Was es
 * kann: eine feste Adresse anrufen und dabei eine Kopfzeile mitschicken.
 *
 *   POST /api/ingest/webhook
 *   X-Ingest-Schluessel: <INGEST_WEBHOOK_TOKEN>
 *   Rumpf: die Nutzlast des Geraets (JSON)
 *
 * Der Schluessel gilt fuer alle Geraete gemeinsam. Das ist schwaecher als ein
 * Geheimnis je Geraet, und das soll hier auch so dastehen: wer ihn hat, kann
 * fuer jedes angelernte Geraet Messwerte einreichen. Ein Geraet uebernehmen
 * kann er damit nicht, und schlimmstenfalls steht ein falscher Fuellstand in
 * der Liste, den die naechste echte Meldung ueberschreibt. Mehr gibt die
 * Sache nicht her, solange das Geraet vom Hersteller kommt.
 *
 * Deshalb gilt: die Adresse gehoert nicht in Handbuecher, und der Schluessel
 * ist lang und zufaellig (scripts/schluessel-erzeugen.mjs).
 *
 * Welches Geraet gemeldet hat, steht in der Nutzlast - Seriennummer, IMEI
 * oder ICCID. Ist keine davon bei uns angelernt, wird abgelehnt: ohne
 * bekanntes Geraet gibt es keinen Container und damit keinen Fuellstand.
 */

const MAX_RUMPF_BYTES = 16 * 1024;

function gleich(a: string, b: string): boolean {
  const links = Buffer.from(a, "utf8");
  const rechts = Buffer.from(b, "utf8");
  if (links.length === 0 || links.length !== rechts.length) return false;
  return timingSafeEqual(links, rechts);
}

export async function POST(request: NextRequest) {
  const erwartet = process.env.INGEST_WEBHOOK_TOKEN;

  // Ohne eingerichteten Schluessel ist der Weg zu. Ein Vorgabewert waere hier
  // dasselbe wie gar keine Pruefung, nur schwerer zu bemerken.
  if (!erwartet || erwartet.length < 16) {
    return NextResponse.json(
      { fehler: "Dieser Annahmeweg ist nicht eingerichtet (INGEST_WEBHOOK_TOKEN fehlt)." },
      { status: 503 },
    );
  }

  const mitgeschickt =
    request.headers.get("x-ingest-schluessel") ??
    request.headers.get("x-ingest-token") ??
    "";

  if (!gleich(erwartet, mitgeschickt.trim())) {
    return NextResponse.json({ fehler: "Schlüssel ungültig" }, { status: 401 });
  }

  const angekuendigt = Number(request.headers.get("content-length"));
  if (Number.isFinite(angekuendigt) && angekuendigt > MAX_RUMPF_BYTES) {
    return NextResponse.json({ fehler: "Rumpf zu groß" }, { status: 413 });
  }

  const rohtext = await request.text();
  if (Buffer.byteLength(rohtext, "utf8") > MAX_RUMPF_BYTES) {
    return NextResponse.json({ fehler: "Rumpf zu groß" }, { status: 413 });
  }

  let rumpf: Record<string, unknown>;
  try {
    const gelesen: unknown = JSON.parse(rohtext);
    if (!gelesen || typeof gelesen !== "object" || Array.isArray(gelesen)) {
      return NextResponse.json({ fehler: "Rumpf ist kein JSON-Objekt" }, { status: 400 });
    }
    rumpf = gelesen as Record<string, unknown>;
  } catch {
    return NextResponse.json({ fehler: "Rumpf ist kein gültiges JSON" }, { status: 400 });
  }

  const meldung = ausMeldung(rumpf);

  const sensor = await sensorZuKennung(meldung.kennung);
  if (!sensor) {
    // Die gesuchten Kennungen werden zurueckgemeldet: beim Einrichten ist das
    // die einzige Stelle, an der sich sehen laesst, unter welchem Namen sich
    // das Geraet meldet - und damit, was in die Geraeteaufnahme gehoert.
    return NextResponse.json(
      { fehler: "Gerät unbekannt", gesucht: meldung.kennung },
      { status: 404 },
    );
  }

  if (meldung.abstand_mm === null) {
    // Ein Lebenszeichen ohne Messwert ist kein Fehler des Absenders - die
    // Geraete melden auch nach dem Einschalten und beim Lagewechsel. Es
    // trotzdem als Messung abzulegen wuerde die Kalibrierung verderben.
    return NextResponse.json({ ok: true, gespeichert: false, grund: "kein Abstand in der Meldung" });
  }

  const ergebnis = await messungSpeichern(
    sensor,
    {
      // Der unveraenderte Rumpf zuerst: er wandert als Ganzes nach
      // messung.roh und traegt damit auch die Lage ("normal"/"tilt") und
      // alles, was dieser Dekoder heute noch nicht kennt. Die gelesenen Werte
      // stehen darunter und haben Vorrang - der Dekoder weiss, was gemeint
      // ist, ein zufaellig gleich benanntes Feld im Rumpf nicht.
      ...rumpf,
      abstand_mm: meldung.abstand_mm,
      batterie_prozent: meldung.batterie_prozent,
      temperatur_c: meldung.temperatur_c,
      rssi: meldung.rssi,
      anlass: "intervall",
      gemessen_am: meldung.gemessen_am,
    },
    new Date(),
  );

  if (!ergebnis.ok) {
    return NextResponse.json({ fehler: ergebnis.fehler }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    gespeichert: true,
    angelernt: sensor.container_id !== null,
    abstand_mm: meldung.abstand_mm,
  });
}
