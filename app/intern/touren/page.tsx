import { serverClient } from "@/lib/supabase/server";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { Tourenansicht } from "./Tourenansicht";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tour" };

export interface Tourzeile {
  container_id: string;
  nummer: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number | null;
  lng: number | null;
  fuellstand_prozent: number | null;
  gemessen_am: string | null;
  stunden_seit_messung: number | null;
  offene_meldungen: number;
  prioritaet: number;
}

/** Optionaler fester Ausgangspunkt der Tour (Einstellung "betriebshof"). */
function betriebshofLesen(werte: Record<string, unknown>) {
  const wert = werte["betriebshof"];
  if (!wert || typeof wert !== "object") return null;

  const { lat, lng, name } = wert as { lat?: unknown; lng?: unknown; name?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return { lat, lng, name: typeof name === "string" ? name : "Betriebshof" };
}

export default async function TourenSeite() {
  const supabase = serverClient();
  const [antwort, werte] = await Promise.all([
    supabase.rpc("tourenliste", { p_schwelle: null }),
    einstellungen(supabase),
  ]);

  const zeilen = (antwort.data ?? []) as Tourzeile[];
  const schwelle = zahlAusEinstellung(werte, "schwelle_warnung", 75);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Nächste Tour</h1>
        <p className="mt-1 text-sm text-ink-2">
          Container ab {schwelle} % Füllstand sowie alle mit offener Meldung – in der Reihenfolge der
          kürzesten Fahrtstrecke.
        </p>
      </div>

      {antwort.error && (
        <p className="karte-flaeche p-4 text-sm text-ink-2">
          Die Tourenliste konnte nicht geladen werden: {antwort.error.message}
        </p>
      )}

      <Tourenansicht zeilen={zeilen} betriebshof={betriebshofLesen(werte)} />
    </div>
  );
}
