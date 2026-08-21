"use client";

import { useMemo, useState } from "react";
import { Kartenansicht } from "@/components/Kartenansicht";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { STUFEN, adresse, alterText, prozentText, standzeitText, stufeVon } from "@/lib/fuellstand";
import type { OeffentlicherContainer } from "@/lib/typen";

type Filter = "alle" | "platz" | "voll";

export function OeffentlicheAnsicht({ container }: { container: OeffentlicherContainer[] }) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [suche, setSuche] = useState("");

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();
    return container.filter((c) => {
      const stufe = stufeVon(c.fuellstand_prozent);
      if (filter === "platz" && (stufe === "voll" || stufe === "hoch")) return false;
      if (filter === "voll" && stufe !== "voll") return false;
      if (!text) return true;
      return [c.nummer, c.bezeichnung, c.strasse, c.plz, c.ort]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [container, filter, suche]);

  const mitPlatz = container.filter((c) => {
    const s = stufeVon(c.fuellstand_prozent);
    return s === "frei" || s === "teilweise";
  }).length;

  return (
    <div className="space-y-4">
      {/* Filterzeile: eine Reihe oberhalb der Darstellung */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-flaeche p-0.5" role="group" aria-label="Filter">
          {(
            [
              ["alle", `Alle (${container.length})`],
              ["platz", `Noch Platz (${mitPlatz})`],
              ["voll", "Voll"],
            ] as [Filter, string][]
          ).map(([wert, text]) => (
            <button
              key={wert}
              type="button"
              onClick={() => setFilter(wert)}
              aria-pressed={filter === wert}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                filter === wert ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Ort oder Straße suchen"
          className="feld max-w-xs flex-1"
          aria-label="Container suchen"
        />
      </div>

      <Kartenansicht
        hoeheKlasse="h-[380px] sm:h-[460px]"
        punkte={gefiltert.map((c) => ({
          id: c.id,
          nummer: c.nummer,
          bezeichnung: c.bezeichnung,
          strasse: c.strasse,
          plz: c.plz,
          ort: c.ort,
          lat: c.lat,
          lng: c.lng,
          fuellstand_prozent: c.fuellstand_prozent,
          gemessen_am: c.gemessen_am,
          standtage: c.standtage,
        }))}
      />

      {/* Liste - auf dem Handy oft schneller als die Karte */}
      <div className="karte-flaeche divide-y overflow-hidden">
        {gefiltert.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">Kein Container passt zur Auswahl.</p>
        )}

        {gefiltert.map((c) => {
          const stufe = stufeVon(c.fuellstand_prozent);
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2">
                  <Stufensymbol stufe={stufe} />
                  <span className="font-medium">{c.bezeichnung ?? c.nummer}</span>
                </div>
                <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(c)}</div>
              </div>

              <div className="w-full max-w-[220px] shrink-0">
                <Fuellstandsbalken prozent={c.fuellstand_prozent} />
                <div className="mt-1 text-xs text-ink-3">
                  {STUFEN[stufe].text} · Stand {alterText(c.gemessen_am)}
                </div>
              </div>

              <div className="w-full text-xs text-ink-3 sm:w-40 sm:text-right">
                Standort seit {standzeitText(c.standtage)}
                <span className="sr-only"> – Füllstand {prozentText(c.fuellstand_prozent)}</span>
              </div>

              {c.lat && c.lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="knopf-sekundaer shrink-0"
                >
                  Route
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
