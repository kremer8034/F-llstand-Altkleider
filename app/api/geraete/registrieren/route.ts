import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Erstinbetriebnahme eines Geraets ("trust on first use").
 *
 * Beim allerersten Start meldet sich die Box mit dem gemeinsamen Werksschluessel
 * und ihrer Geraete-ID und bekommt einmalig ihr individuelles Geheimnis. Danach
 * ist dieser Weg fuer das Geraet gesperrt - ein zweiter Versuch wird abgelehnt.
 *
 * Wer den Schluessel lieber direkt flasht, braucht diesen Endpunkt nicht.
 */
export async function POST(request: NextRequest) {
  const werksschluessel = process.env.GERAETE_PROVISIONIERUNG_SCHLUESSEL;
  const mitgesendet = request.headers.get("x-provisionierung");

  if (!werksschluessel || werksschluessel.length < 32) {
    return NextResponse.json({ fehler: "Provisionierung ist nicht eingerichtet" }, { status: 503 });
  }
  if (!mitgesendet || mitgesendet.length !== werksschluessel.length) {
    return NextResponse.json({ fehler: "Nicht berechtigt" }, { status: 401 });
  }
  if (!timingSafeEqual(Buffer.from(mitgesendet), Buffer.from(werksschluessel))) {
    return NextResponse.json({ fehler: "Nicht berechtigt" }, { status: 401 });
  }

  let daten: { geraete_id?: string; imei?: string; iccid?: string; firmware?: string };
  try {
    daten = await request.json();
  } catch {
    return NextResponse.json({ fehler: "Rumpf ist kein gültiges JSON" }, { status: 400 });
  }

  if (!daten.geraete_id) {
    return NextResponse.json({ fehler: "geraete_id fehlt" }, { status: 400 });
  }

  const admin = adminClient();

  const { data: sensor } = await admin
    .from("sensor")
    .select("id")
    .eq("geraete_id", daten.geraete_id)
    .maybeSingle();

  if (!sensor) {
    return NextResponse.json(
      { fehler: "Gerät ist im System nicht angelegt. Bitte zuerst unter Sensoren aufnehmen." },
      { status: 404 },
    );
  }

  const { data: geheimnis } = await admin
    .from("sensor_geheimnis")
    .select("geheimnis, ausgegeben_am")
    .eq("sensor_id", sensor.id)
    .maybeSingle();

  if (!geheimnis) {
    return NextResponse.json({ fehler: "Für dieses Gerät ist kein Schlüssel hinterlegt" }, { status: 409 });
  }
  if (geheimnis.ausgegeben_am) {
    return NextResponse.json(
      { fehler: "Der Schlüssel wurde bereits abgeholt. Für einen Neustart bitte in der Verwaltung zurücksetzen." },
      { status: 409 },
    );
  }

  await admin
    .from("sensor_geheimnis")
    .update({ ausgegeben_am: new Date().toISOString() })
    .eq("sensor_id", sensor.id);

  await admin
    .from("sensor")
    .update({
      imei: daten.imei ?? null,
      iccid: daten.iccid ?? null,
      firmware: daten.firmware ?? null,
    })
    .eq("id", sensor.id);

  return NextResponse.json({ ok: true, geheimnis: geheimnis.geheimnis });
}
