"use client";

import dynamic from "next/dynamic";
import type { Kartenpunkt } from "./Karte";
import { Kartenlegende } from "./Karte";

// Leaflet greift auf window zu und wird deshalb erst im Browser geladen.
// Der dynamische Import gehoert in eine Client-Komponente - in einer
// Server-Komponente ist ssr:false nicht zulaessig.
const Karte = dynamic(() => import("./Karte"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-flaeche-2" />,
});

export function Kartenansicht({
  punkte,
  hoeheKlasse = "h-[420px]",
  mitLegende = true,
  eigenePosition = null,
}: {
  punkte: Kartenpunkt[];
  hoeheKlasse?: string;
  mitLegende?: boolean;
  eigenePosition?: { lat: number; lng: number } | null;
}) {
  return (
    <div className="karte-flaeche overflow-hidden">
      <div className={hoeheKlasse}>
        <Karte punkte={punkte} eigenePosition={eigenePosition} />
      </div>
      {mitLegende && (
        <div className="border-t px-4 py-3">
          <Kartenlegende />
        </div>
      )}
    </div>
  );
}
