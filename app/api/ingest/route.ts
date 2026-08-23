import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { messungSpeichern, sensorZuKennung, type Messmeldung } from "@/lib/messung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Messwertannahme fuer die eigene Firmware.
 *
 * Authentifizierung ohne Zertifikate und ohne Passwoerter im Geraet: jede Box
 * hat ein eigenes 32-Byte-Geheimnis und signiert damit ihre Meldung.
 *
 *   POST /api/ingest
 *   X-Geraet-Id:    ALT-0042
 *   X-Zeitstempel:  1755782400            (Unixzeit in Sekunden)
 *   X-Signatur:     <hex>                 HMAC-SHA256 ueber
 *                                         "<geraete-id>.<zeitstempel>.<rumpf>"
 *   Rumpf: {"abstand_mm":812,"batterie_v":3.91,"temperatur_c":14.2,
 *           "rssi":-91,"anlass":"intervall","firmware":"1.0.0"}
 *
 * Der Zeitstempel verhindert, dass jemand eine mitgeschnittene Meldung
 * spaeter erneut einspielt.
 *
 * Diese Route macht nur den Ausweis: was danach mit der Meldung geschieht,
 * steht in lib/messung.ts - dieselbe Stelle wuerde ein zweiter Annahmeweg
 * nutzen (docs/sensor-entscheidung.md, Abschnitt 5).
 */

const MAX_ABWEICHUNG_SEKUNDEN = 15 * 60;

function gleich(a: string, b: string): boolean {
  const links = Buffer.from(a, "hex");
  const rechts = Buffer.from(b, "hex");
  if (links.length === 0 || links.length !== rechts.length) return false;
  return timingSafeEqual(links, rechts);
}

export async function POST(request: NextRequest) {
  const geraeteId = request.headers.get("x-geraet-id");
  const zeitstempel = request.headers.get("x-zeitstempel");
  const signatur = request.headers.get("x-signatur");

  if (!geraeteId || !zeitstempel || !signatur) {
    return NextResponse.json({ fehler: "Kopfzeilen unvollständig" }, { status: 400 });
  }

  const jetzt = Math.floor(Date.now() / 1000);
  const gesendet = Number(zeitstempel);
  if (!Number.isFinite(gesendet) || Math.abs(jetzt - gesendet) > MAX_ABWEICHUNG_SEKUNDEN) {
    return NextResponse.json({ fehler: "Zeitstempel außerhalb des Fensters" }, { status: 401 });
  }

  // Erst die angekuendigte Groesse pruefen, dann lesen: sonst liegt ein
  // uebergrosser Rumpf schon vollstaendig im Speicher, bevor er abgelehnt wird.
  const angekuendigt = Number(request.headers.get("content-length"));
  if (Number.isFinite(angekuendigt) && angekuendigt > 4096) {
    return NextResponse.json({ fehler: "Rumpf zu groß" }, { status: 413 });
  }

  const rumpf = await request.text();
  if (Buffer.byteLength(rumpf, "utf8") > 4096) {
    return NextResponse.json({ fehler: "Rumpf zu groß" }, { status: 413 });
  }

  const sensor = await sensorZuKennung({ geraete_id: geraeteId });
  if (!sensor) {
    return NextResponse.json({ fehler: "Gerät unbekannt" }, { status: 404 });
  }

  const { data: geheimnis } = await adminClient()
    .from("sensor_geheimnis")
    .select("geheimnis")
    .eq("sensor_id", sensor.id)
    .maybeSingle();

  if (!geheimnis) {
    return NextResponse.json({ fehler: "Gerät nicht provisioniert" }, { status: 403 });
  }

  const erwartet = createHmac("sha256", Buffer.from(geheimnis.geheimnis, "hex"))
    .update(`${geraeteId}.${zeitstempel}.${rumpf}`)
    .digest("hex");

  if (!gleich(erwartet, signatur.trim().toLowerCase())) {
    return NextResponse.json({ fehler: "Signatur ungültig" }, { status: 401 });
  }

  let daten: Messmeldung;
  try {
    daten = JSON.parse(rumpf) as Messmeldung;
  } catch {
    return NextResponse.json({ fehler: "Rumpf ist kein gültiges JSON" }, { status: 400 });
  }

  const ergebnis = await messungSpeichern(sensor, daten, new Date(gesendet * 1000));
  if (!ergebnis.ok) {
    return NextResponse.json({ fehler: ergebnis.fehler }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    // Das Geraet richtet seinen Schlafrhythmus nach dieser Antwort - so laesst
    // sich das Intervall aus der Oberflaeche heraus aendern.
    intervall_minuten: sensor.intervall_minuten,
    serverzeit: jetzt,
    angelernt: sensor.container_id !== null,
  });
}
