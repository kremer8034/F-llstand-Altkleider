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
          Container ab {schwelle} % Füllstand sowie alle mit offener Meldung – nach Dringlichkeit
          sortiert.
        </p>
      </div>

      {antwort.error && (
        <p className="karte-flaeche p-4 text-sm text-ink-2">
          Die Tourenliste konnte nicht geladen werden: {antwort.error.message}
        </p>
      )}

      <Tourenansicht zeilen={zeilen} />
    </div>
  );
}
