import { NextResponse } from "next/server";
import { oeffentlicherClient } from "@/lib/supabase/oeffentlich";

export const revalidate = 60;

/**
 * Oeffentliche Containerliste als JSON - gedacht zum Einbinden in brk-mill.de.
 * Liefert genau das, was auch die oeffentliche Karte zeigt: Standort,
 * Fuellstandsstufe und Alter der Messung. Keine Sensordaten.
 */
export async function GET() {
  const supabase = oeffentlicherClient();

  const { data, error } = await supabase
    .from("oeffentliche_container")
    .select("id, nummer, bezeichnung, strasse, plz, ort, lat, lng, fuellstand_prozent, stufe, gemessen_am, stunden_seit_messung")
    .order("ort")
    .order("nummer");

  if (error) {
    return NextResponse.json({ fehler: "Nicht abrufbar" }, { status: 503 });
  }

  return NextResponse.json(
    { stand: new Date().toISOString(), anzahl: data?.length ?? 0, container: data ?? [] },
    {
      headers: {
        // Lesender Zugriff von der Vereinswebseite aus
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
