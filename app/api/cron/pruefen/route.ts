import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stuendliche Kontrolle: welcher angelernte Sensor hat zu lange nichts mehr
 * gemeldet? Wird von Vercel Cron aufgerufen (siehe vercel.json). Alternativ
 * laesst sich dieselbe Funktion in Supabase per pg_cron einplanen.
 */
export async function GET(request: NextRequest) {
  const erwartet = process.env.CRON_SECRET;
  const kopf = request.headers.get("authorization");

  // Vercel Cron sendet "Bearer <CRON_SECRET>", wenn die Variable gesetzt ist.
  if (erwartet && kopf !== `Bearer ${erwartet}`) {
    return NextResponse.json({ fehler: "Nicht berechtigt" }, { status: 401 });
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc("pruefe_stille_sensoren");

  if (error) {
    return NextResponse.json({ fehler: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, neue_alarme: data ?? 0 });
}
