import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Messwertannahme fuer die Sensoren.
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

  const admin = adminClient();

  const { data: sensor } = await admin
    .from("sensor")
    .select("id, container_id, status, intervall_minuten, firmware")
    .eq("geraete_id", geraeteId)
    .maybeSingle();

  if (!sensor) {
    return NextResponse.json({ fehler: "Gerät unbekannt" }, { status: 404 });
  }

  const { data: geheimnis } = await admin
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

  let daten: Record<string, unknown>;
  try {
    daten = JSON.parse(rumpf);
  } catch {
    return NextResponse.json({ fehler: "Rumpf ist kein gültiges JSON" }, { status: 400 });
  }

  const zahl = (wert: unknown): number | null => {
    const n = Number(wert);
    return Number.isFinite(n) ? n : null;
  };

  // Der Zeitpunkt kommt aus dem Geraet und wandert unveraendert in eine
  // timestamptz-Spalte. Eine krumme Angabe (verstellte Uhr, Fehler in der
  // Firmware) laesst das Einfuegen sonst mit einem Serverfehler auflaufen, und
  // das Geraet sendet dieselbe Meldung endlos nach.
  const gemessenAm = (() => {
    if (typeof daten.gemessen_am === "string") {
      const gelesen = new Date(daten.gemessen_am);
      if (!Number.isNaN(gelesen.getTime())) return gelesen.toISOString();
    }
    return new Date(gesendet * 1000).toISOString();
  })();

  const { error } = await admin.from("messung").insert({
    sensor_id: sensor.id,
    container_id: sensor.container_id,
    gemessen_am: gemessenAm,
    abstand_mm: zahl(daten.abstand_mm),
    batterie_v: zahl(daten.batterie_v),
    temperatur_c: zahl(daten.temperatur_c),
    rssi: zahl(daten.rssi),
    anlass: ["intervall", "test", "taster", "schwellwert", "neustart"].includes(String(daten.anlass))
      ? String(daten.anlass)
      : "intervall",
    roh: daten,
  });

  // Eine doppelt gesendete Messung (Wiederholung nach Funkabbruch) ist kein
  // Fehler - das Geraet soll seine Warteschlange trotzdem leeren duerfen.
  if (error && error.code !== "23505") {
    return NextResponse.json({ fehler: "Messwert konnte nicht gespeichert werden" }, { status: 500 });
  }

  const firmware = typeof daten.firmware === "string" ? daten.firmware : null;
  if (firmware && firmware !== sensor.firmware) {
    await admin.from("sensor").update({ firmware }).eq("id", sensor.id);
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
