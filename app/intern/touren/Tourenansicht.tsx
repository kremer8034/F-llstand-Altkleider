"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { adresse, alterText, stufeVon } from "@/lib/fuellstand";
import type { Tourzeile } from "./page";

/** Entfernung in Kilometern zwischen zwei Koordinaten (Haversine). */
function entfernungKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function Tourenansicht({ zeilen }: { zeilen: Tourzeile[] }) {
  const [standort, setStandort] = useState<[number, number] | null>(null);
  const [nachEntfernung, setNachEntfernung] = useState(false);
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());

  const sortiert = useMemo(() => {
    if (!nachEntfernung || !standort) return zeilen;
    return [...zeilen].sort((a, b) => {
      if (a.lat === null || a.lng === null) return 1;
      if (b.lat === null || b.lng === null) return -1;
      return entfernungKm(standort, [a.lat, a.lng]) - entfernungKm(standort, [b.lat, b.lng]);
    });
  }, [zeilen, nachEntfernung, standort]);

  function standortHolen() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStandort([position.coords.latitude, position.coords.longitude]);
        setNachEntfernung(true);
      },
      () => setNachEntfernung(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const mitKoordinaten = sortiert.filter((z) => z.lat !== null && z.lng !== null && !erledigt.has(z.container_id));

  // Google Maps nimmt bis zu neun Zwischenziele entgegen.
  const routenLink =
    mitKoordinaten.length > 0
      ? `https://www.google.com/maps/dir/?api=1&destination=${mitKoordinaten[mitKoordinaten.length - 1].lat},${
          mitKoordinaten[mitKoordinaten.length - 1].lng
        }` +
        (mitKoordinaten.length > 1
          ? `&waypoints=${mitKoordinaten
              .slice(0, 9)
              .map((z) => `${z.lat},${z.lng}`)
              .join("|")}`
          : "")
      : null;

  if (zeilen.length === 0) {
    return (
      <div className="karte-flaeche p-8 text-center">
        <p className="font-medium">Nichts zu tun.</p>
        <p className="mt-1 text-sm text-ink-2">
          Kein Container hat die Warnschwelle erreicht und es liegen keine Meldungen vor.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={standortHolen} className="knopf-sekundaer">
          {standort ? "Standort aktualisieren" : "Nach Nähe sortieren"}
        </button>

        {standort && (
          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={nachEntfernung}
              onChange={(e) => setNachEntfernung(e.target.checked)}
            />
            nach Entfernung statt Dringlichkeit
          </label>
        )}

        {routenLink && (
          <a href={routenLink} target="_blank" rel="noreferrer noopener" className="knopf-primaer ml-auto">
            Route öffnen ({Math.min(mitKoordinaten.length, 10)} Ziele)
          </a>
        )}
      </div>

      <ol className="karte-flaeche divide-y overflow-hidden">
        {sortiert.map((z, index) => {
          const stufe = stufeVon(z.fuellstand_prozent);
          const abgehakt = erledigt.has(z.container_id);
          const entfernung =
            standort && z.lat !== null && z.lng !== null ? entfernungKm(standort, [z.lat, z.lng]) : null;

          return (
            <li
              key={z.container_id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${abgehakt ? "opacity-45" : ""}`}
            >
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={abgehakt}
                  onChange={(e) => {
                    const neu = new Set(erledigt);
                    if (e.target.checked) neu.add(z.container_id);
                    else neu.delete(z.container_id);
                    setErledigt(neu);
                  }}
                  aria-label="Als abgearbeitet markieren"
                />
                <span className="zahl w-6 text-right text-sm text-ink-3">{index + 1}.</span>
              </label>

              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Stufensymbol stufe={stufe} />
                  <Link
                    href={`/intern/container/${z.container_id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {z.bezeichnung ?? z.nummer}
                  </Link>
                  <span className="zahl text-xs text-ink-3">{z.nummer}</span>
                  {z.offene_meldungen > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                      style={{ background: "var(--ernst)" }}
                    >
                      {z.offene_meldungen} Meldung{z.offene_meldungen > 1 ? "en" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(z)}</div>
              </div>

              <div className="w-full max-w-[200px]">
                <Fuellstandsbalken prozent={z.fuellstand_prozent} />
                <div className="mt-1 text-xs text-ink-3">
                  {alterText(z.gemessen_am)}
                  {entfernung !== null && ` · ${entfernung.toFixed(1).replace(".", ",")} km`}
                </div>
              </div>

              {z.lat !== null && z.lng !== null && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${z.lat},${z.lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="knopf-sekundaer shrink-0"
                >
                  Navigation
                </a>
              )}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-ink-3">
        Die Haken dienen der Übersicht während der Fahrt und werden nicht gespeichert. Die eigentliche
        Leerung wird auf der Containerseite erfasst – oder automatisch am nächsten Sensorwert erkannt.
      </p>
    </div>
  );
}
