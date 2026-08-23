"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";

export interface Standortzeile {
  id: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  aktiv: boolean;
  container_gesamt: number;
  container_voll: number;
  kapazitaet_liter: number | null;
  freie_liter: number | null;
  freie_prozent: number | null;
  zufluss_liter_je_tag: number | null;
  offene_meldungen: number;
}

type Sortierung = "kapazitaet" | "name" | "ort" | "groesse";

const L = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/**
 * Der Balken zeigt hier den GEFÜLLTEN Anteil, damit er sich wie überall sonst
 * liest: voll ist rot. Die Zahl daneben nennt trotzdem den freien Platz, weil
 * das die Größe ist, nach der entschieden wird.
 */
export function Standortliste({ zeilen, reserve }: { zeilen: Standortzeile[]; reserve: number }) {
  const [suche, setSuche] = useState("");
  const [sortierung, setSortierung] = useState<Sortierung>("kapazitaet");
  const [nurCluster, setNurCluster] = useState(false);

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();

    const liste = zeilen.filter((z) => {
      if (nurCluster && z.container_gesamt < 2) return false;
      if (!text) return true;
      return [z.name, z.strasse, z.plz, z.ort].filter(Boolean).join(" ").toLowerCase().includes(text);
    });

    const sortiert = [...liste];
    sortiert.sort((a, b) => {
      switch (sortierung) {
        case "name":
          return a.name.localeCompare(b.name, "de");
        case "ort":
          return (a.ort ?? "").localeCompare(b.ort ?? "", "de") || a.name.localeCompare(b.name, "de");
        case "groesse":
          return b.container_gesamt - a.container_gesamt || a.name.localeCompare(b.name, "de");
        default:
          // Wenig Platz zuerst - ohne Wert ans Ende
          return (a.freie_prozent ?? 999) - (b.freie_prozent ?? 999);
      }
    });
    return sortiert;
  }, [zeilen, suche, sortierung, nurCluster]);

  const cluster = zeilen.filter((z) => z.container_gesamt >= 2).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Name, Straße, Ort …"
          className="feld w-auto min-w-[14rem] flex-1"
          aria-label="Suche"
        />

        <select
          value={sortierung}
          onChange={(e) => setSortierung(e.target.value as Sortierung)}
          className="feld w-auto"
          aria-label="Sortierung"
        >
          <option value="kapazitaet">Wenig Platz zuerst</option>
          <option value="groesse">Größte Standorte zuerst</option>
          <option value="name">Name</option>
          <option value="ort">Ort</option>
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" checked={nurCluster} onChange={(e) => setNurCluster(e.target.checked)} />
          nur Cluster ({cluster})
        </label>

        <span className="ml-auto text-sm text-ink-3">{gefiltert.length} Standorte</span>
      </div>

      <div className="karte-flaeche divide-y overflow-hidden">
        {gefiltert.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">Kein Standort passt zur Auswahl.</p>
        )}

        {gefiltert.map((z) => {
          const gefuellt =
            z.freie_prozent === null ? null : Math.round(100 - z.freie_prozent);
          const knapp = z.freie_prozent !== null && z.freie_prozent < reserve;

          return (
            <Link
              key={z.id}
              href={`/intern/standorte/${z.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-flaeche-2"
            >
              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{z.name}</span>
                  <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                    {z.container_gesamt} {z.container_gesamt === 1 ? "Container" : "Container"}
                  </span>
                  {!z.aktiv && (
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">inaktiv</span>
                  )}
                  {z.offene_meldungen > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                      style={{ background: "var(--ernst)" }}
                    >
                      {z.offene_meldungen} Meldung{z.offene_meldungen > 1 ? "en" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-ink-2">
                  {[z.strasse, [z.plz, z.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") ||
                    "keine Adresse hinterlegt"}
                </div>
              </div>

              <div className="w-full max-w-[220px]">
                <Fuellstandsbalken prozent={gefuellt} />
                <div className={`mt-1 text-xs ${knapp ? "font-medium text-ink" : "text-ink-3"}`}>
                  {z.freie_liter === null
                    ? "kein Messwert"
                    : `${L.format(z.freie_liter)} l frei (${z.freie_prozent} %)`}
                </div>
              </div>

              <div className="w-full text-xs text-ink-3 sm:w-40 sm:text-right">
                <div>
                  {z.container_voll > 0
                    ? `${z.container_voll} von ${z.container_gesamt} voll`
                    : "keiner voll"}
                </div>
                <div>
                  {z.zufluss_liter_je_tag
                    ? `${L.format(z.zufluss_liter_je_tag)} l am Tag`
                    : "Zufluss unbekannt"}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
