import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stuendliche Kontrolle: welcher angelernte Sensor hat zu lange nichts mehr
 * gemeldet?
 *
 * Im Betrieb bei Supabase ruft diesen Endpunkt niemand - dort laeuft
 * pruefe_stille_sensoren() als Datenbank-Job (pg_cron, Migration 0006). Beim
 * Docker-Betrieb uebernimmt der Dienst "cron" aus docker-compose.yml, und von
 * Hand laesst er sich jederzeit ausloesen.
 *
 * Der Aufruf legt Alarme an und ist deshalb geschuetzt: ohne gesetztes
 * CRON_SECRET antwortet der Endpunkt gar nicht erst. Frueher war die Pruefung
 * an die Variable gebunden ("wenn gesetzt, dann pruefen") - eine Instanz ohne
 * CRON_SECRET haette den Endpunkt also fuer alle offen gehabt, obwohl die
 * Dokumentation ihn als geschuetzt fuehrt.
 */
function gleich(a: string, b: string): boolean {
  const links = Buffer.from(a, "utf8");
  const rechts = Buffer.from(b, "utf8");
  if (links.length === 0 || links.length !== rechts.length) return false;
  return timingSafeEqual(links, rechts);
}

export async function GET(request: NextRequest) {
  const erwartet = process.env.CRON_SECRET;

  if (!erwartet) {
    return NextResponse.json(
      { fehler: "CRON_SECRET ist nicht gesetzt - der Endpunkt ist abgeschaltet." },
      { status: 503 },
    );
  }

  // Vercel Cron und der Docker-Dienst senden "Bearer <CRON_SECRET>".
  const kopf = request.headers.get("authorization") ?? "";
  if (!gleich(kopf, `Bearer ${erwartet}`)) {
    return NextResponse.json({ fehler: "Nicht berechtigt" }, { status: 401 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc("pruefe_stille_sensoren");

  if (error) {
    // Die Meldung der Datenbank bleibt im Serverprotokoll - nach aussen geht
    // nur, dass es nicht geklappt hat.
    console.error("Prueflauf fehlgeschlagen:", error.message);
    return NextResponse.json({ fehler: "Prüflauf fehlgeschlagen" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, neue_alarme: data ?? 0 });
}
