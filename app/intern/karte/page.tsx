import { serverClient } from "@/lib/supabase/server";
import { Kartenansicht } from "@/components/Kartenansicht";
import type { StandortZustand } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Karte" };

/**
 * Die interne Karte zeigt Plaetze, nicht Container.
 *
 * Bis 0022 stand hier je Container eine Stecknadel - was an einem Parkplatz
 * mit sechs Containern sechs Nadeln uebereinander ergab. Seit die Anschrift am
 * Platz haengt, gibt es auch nur noch dessen Koordinaten; die Karte folgt dem.
 * Wer zu einem einzelnen Container will, kommt ueber den Platz dorthin.
 */
export default async function InterneKarte() {
  const supabase = await serverClient();
  const { data } = await supabase.from("standort_zustand").select("*").eq("aktiv", true);
  const plaetze = (data ?? []) as StandortZustand[];

  const punkte = plaetze
    .filter((p) => p.lat !== null && p.lng !== null)
    .map((p) => ({
      id: p.standort_id,
      // Die Karte fuehrt eine "nummer" - intern ist das der Platzname.
      nummer: p.name,
      bezeichnung: p.name,
      strasse: null,
      plz: null,
      ort: p.ort,
      lat: p.lat as number,
      lng: p.lng as number,
      fuellstand_prozent: p.belegt_prozent === null ? null : Math.round(p.belegt_prozent),
      gemessen_am: null,
      detailPfad: `/intern/standorte/${p.standort_id}`,
    }));

  const ohneKoordinaten = plaetze.length - punkte.length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Karte</h1>
        <p className="mt-1 text-sm text-ink-2">
          {punkte.length} Standorte mit Koordinaten
          {ohneKoordinaten > 0 && ` · ${ohneKoordinaten} ohne Koordinaten`}
        </p>
        {ohneKoordinaten > 0 && (
          <p className="mt-1 text-sm text-ink-3">
            Standorte ohne Koordinaten fehlen hier und auf der öffentlichen Seite – samt aller
            Container, die dort stehen.
          </p>
        )}
      </div>

      <Kartenansicht punkte={punkte} hoeheKlasse="h-[calc(100dvh-320px)] min-h-[420px]" />
    </div>
  );
}
