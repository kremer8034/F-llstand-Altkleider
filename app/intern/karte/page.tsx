import { serverClient } from "@/lib/supabase/server";
import { containerMitZustand } from "@/lib/daten";
import { Kartenansicht } from "@/components/Kartenansicht";

export const dynamic = "force-dynamic";
export const metadata = { title: "Karte" };

export default async function InterneKarte() {
  const supabase = serverClient();
  const zeilen = await containerMitZustand(supabase);

  const punkte = zeilen
    .filter((z) => z.lat !== null && z.lng !== null && z.status !== "entfernt")
    .map((z) => ({
      id: z.id,
      nummer: z.nummer,
      bezeichnung: z.bezeichnung,
      strasse: z.strasse,
      plz: z.plz,
      ort: z.ort,
      lat: z.lat as number,
      lng: z.lng as number,
      fuellstand_prozent: z.zustand?.fuellstand_prozent ?? null,
      gemessen_am: z.zustand?.gemessen_am ?? null,
      standtage: z.aufstelldatum
        ? Math.floor((Date.now() - new Date(z.aufstelldatum).getTime()) / 86400000)
        : null,
      detailPfad: `/intern/container/${z.id}`,
    }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Karte</h1>
        <p className="mt-1 text-sm text-ink-2">
          {punkte.length} Container mit Koordinaten
          {zeilen.length - punkte.length > 0 && ` \u00b7 ${zeilen.length - punkte.length} ohne Koordinaten`}
        </p>
      </div>

      <Kartenansicht punkte={punkte} hoeheKlasse="h-[calc(100dvh-320px)] min-h-[420px]" />
    </div>
  );
}
