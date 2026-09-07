"use client";

import { useMemo, useState } from "react";
import { Kartenansicht } from "@/components/Kartenansicht";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { STUFEN, adresse, alterText, istVeraltet } from "@/lib/fuellstand";
import type { Fuellstandsstufe, OeffentlicherStandort } from "@/lib/typen";

type Filter = "alle" | "platz" | "voll";

/**
 * Nimmt dieser Platz noch etwas auf?
 *
 * Die Stufe kommt aus der Ansicht und steht fuer den GANZEN Platz - Mittel
 * ueber die gemessenen Container (0022). "unbekannt" zaehlt bewusst nicht als
 * Platz: unter "Noch Platz" darf nur stehen, was wir gemessen haben.
 */
function nimmtAuf(stufe: Fuellstandsstufe): boolean {
  return stufe === "frei" || stufe === "teilweise";
}

export function OeffentlicheAnsicht({ plaetze }: { plaetze: OeffentlicherStandort[] }) {
  const [filter, setFilter] = useState<Filter>("alle");
  const [suche, setSuche] = useState("");

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();
    return plaetze.filter((p) => {
      if (filter === "platz" && !nimmtAuf(p.stufe)) return false;
      if (filter === "voll" && p.stufe !== "voll") return false;
      if (!text) return true;
      return [p.name, p.strasse, p.plz, p.ort]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });
  }, [plaetze, filter, suche]);

  const mitPlatz = plaetze.filter((p) => nimmtAuf(p.stufe)).length;
  // Jeder Filter traegt seine Zahl - sonst muss man klicken, um zu erfahren,
  // ob sich das Klicken lohnt.
  const volle = plaetze.filter((p) => p.stufe === 'voll').length;

  return (
    <div className="space-y-4">
      {/* Filterzeile: eine Reihe oberhalb der Darstellung */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-flaeche p-0.5" role="group" aria-label="Filter">
          {(
            [
              ["alle", `Alle (${plaetze.length})`],
              ["platz", `Noch Platz (${mitPlatz})`],
              ["voll", `Voll (${volle})`],
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
          aria-label="Abgabestelle suchen"
        />
      </div>

      <Kartenansicht
        hoeheKlasse="h-[380px] sm:h-[460px]"
        punkte={gefiltert.map((p) => ({
          id: p.standort_id,
          // Die Karte fuehrt eine "nummer" - nach aussen ist das der Platzname.
          nummer: p.name,
          bezeichnung: p.name,
          strasse: p.strasse,
          plz: p.plz,
          ort: p.ort,
          lat: p.lat,
          lng: p.lng,
          fuellstand_prozent: p.belegt_prozent,
          gemessen_am: p.gemessen_am,
        }))}
      />

      {/* Liste - auf dem Handy oft schneller als die Karte */}
      <div className="karte-flaeche divide-y overflow-hidden">
        {/*
         * Zwei verschiedene Gruende fuer eine leere Liste, und der Unterschied
         * ist fuer den Leser wichtig: Er kann seinen Filter aendern, aber
         * nichts dagegen tun, dass noch keine Daten da sind.
         */}
        {plaetze.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">
            Für dieses Gebiet liegen noch keine Angaben vor.
          </p>
        )}

        {plaetze.length > 0 && gefiltert.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">
            Keine Abgabestelle passt zur Auswahl.
          </p>
        )}

        {gefiltert.map((p) => {
          const veraltet = istVeraltet(p.gemessen_am);

          return (
            <div key={p.standort_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[200px] flex-1">
                <div className="flex items-center gap-2">
                  <Stufensymbol stufe={p.stufe} />
                  <span className="font-medium">{p.name}</span>
                </div>
                <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(p)}</div>
              </div>

              {/*
                Eine Spalte, nicht zwei. Hier standen der Prozentwert am Balken
                UND daneben "insgesamt zu 90 % belegt", dazu "Stand vor 2 Tagen"
                UND "Angabe ist aelter als ein Tag" - dieselbe Aussage jeweils
                zweimal, was die Zeile laenger macht, ohne sie klarer zu machen.

                Was bleibt, steht in der Reihenfolge, in der man es braucht:
                wie voll, wie alt.

                "nicht alles gemessen" stand hier ebenfalls und ist bewusst
                weg. Es beschrieb unsere Ausstattung, nicht seine Frage: dass
                an einem Platz mit sechs Kuebeln erst einer einen Sensor hat,
                aendert an dem, was er wissen will - nimmt der Platz noch
                etwas auf? - gar nichts. Wer davorsteht, sieht ohnehin, was
                voll ist. Fuer den internen Bereich bleibt die Unterscheidung
                erhalten (container_gemessen in oeffentliche_standorte).
              */}
              <div className="w-full max-w-[260px] shrink-0">
                <Fuellstandsbalken prozent={p.belegt_prozent} />
                <div className="mt-1 text-xs text-ink-3">
                  {p.belegt_prozent === null ? "Noch keine Messung" : STUFEN[p.stufe].text}
                  {p.gemessen_am && ` · Stand ${alterText(p.gemessen_am)}`}
                  {veraltet && " (veraltet)"}
                </div>
              </div>

              {p.lat && p.lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
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
