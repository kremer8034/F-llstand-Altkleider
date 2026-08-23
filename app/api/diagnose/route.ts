import { NextResponse } from "next/server";
import { oeffentlicherClient } from "@/lib/supabase/oeffentlich";

// Vorübergehend: klärt, warum oeffentliche_standorte über REST nichts liefert.
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = oeffentlicherClient();
  if (!supabase) return NextResponse.json({ fehler: "nicht eingerichtet" }, { status: 503 });

  const plaetze = await supabase.from("oeffentliche_standorte").select("*").order("name");
  const roh = await supabase.from("oeffentliche_standorte").select("standort_id");
  const container = await supabase.from("oeffentliche_container").select("id").limit(1);

  return NextResponse.json({
    plaetze: { anzahl: plaetze.data?.length ?? null, error: plaetze.error, status: plaetze.status },
    roh: { anzahl: roh.data?.length ?? null, error: roh.error, status: roh.status },
    container: { anzahl: container.data?.length ?? null, error: container.error },
  });
}
