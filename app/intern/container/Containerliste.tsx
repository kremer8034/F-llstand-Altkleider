"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { adresse, alterText, formatDatum, stufeVon } from "@/lib/fuellstand";
import { jahresText, prognoseDatum, rhythmusText, tageText } from "@/lib/prognose";
import type { ContainerStatus } from "@/lib/typen";

export interface Listenzeile {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  status: ContainerStatus;
  oeffentlich: boolean;
  aufstelldatum: string | null;
  fuellstand_prozent: number | null;
  gemessen_am: string | null;
  sensor_geraete_id: string | null;
  kalibriert: boolean;
  /** Tage bis zur Tourenschwelle laut Hochrechnung, null wenn keine moeglich. */
  tage_bis_tour: number | null;
  prognose_tour_am: string | null;
  /** Arithmetisches Mittel der Abstaende zwischen zwei Leerungen. */
  mittel_tage: number | null;
  leerungen_pro_jahr: number | null;
  /** Der Platz, zu dem dieser Container gehoert - null heisst: keiner. */
  standort_id: string | null;
  standort_name: string | null;
}

type Sortierung = "fuellstand" | "prognose" | "haeufigkeit" | "nummer" | "ort" | "messung";

export function Containerliste({ zeilen }: { zeilen: Listenzeile[] }) {
  const [suche, setSuche] = useState("");
  const [status, setStatus] = useState<ContainerStatus | "alle">("aktiv");
  const [nurOhneSensor, setNurOhneSensor] = useState(false);
  const [sortierung, setSortierung] = useState<Sortierung>("fuellstand");

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();

    const liste = zeilen.filter((z) => {
      if (status !== "alle" && z.status !== status) return false;
      if (nurOhneSensor && z.sensor_geraete_id) return false;
      if (!text) return true;
      return [z.nummer, z.bezeichnung, z.strasse, z.plz, z.ort, z.sensor_geraete_id, z.standort_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });

    const sortiert = [...liste];
    sortiert.sort((a, b) => {
      switch (sortierung) {
        case "nummer":
          return a.nummer.localeCompare(b.nummer, "de");
        case "ort":
          return (a.ort ?? "").localeCompare(b.ort ?? "", "de") || a.nummer.localeCompare(b.nummer, "de");
        case "messung":
          return (b.gemessen_am ?? "").localeCompare(a.gemessen_am ?? "");
        case "prognose":
          // Ohne Prognose ans Ende, nicht nach vorn: ein fehlender Wert ist
          // keine Dringlichkeit.
          return (a.tage_bis_tour ?? Infinity) - (b.tage_bis_tour ?? Infinity);
        case "haeufigkeit":
          return (b.leerungen_pro_jahr ?? -1) - (a.leerungen_pro_jahr ?? -1);
        default:
          return (b.fuellstand_prozent ?? -1) - (a.fuellstand_prozent ?? -1);
      }
    });
    return sortiert;
  }, [zeilen, suche, status, nurOhneSensor, sortierung]);

  return (
    <div className="space-y-3">
      {/* Filter in einer Reihe oberhalb der Liste */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Nummer, Standort, Ort oder Geräte-ID"
          className="feld max-w-sm flex-1"
          aria-label="Container suchen"
        />

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ContainerStatus | "alle")}
          className="feld w-auto"
          aria-label="Status"
        >
          <option value="aktiv">Aktiv</option>
          <option value="inaktiv">Inaktiv</option>
          <option value="defekt">Defekt</option>
          <option value="entfernt">Entfernt</option>
          <option value="alle">Alle Status</option>
        </select>

        <select
          value={sortierung}
          onChange={(e) => setSortierung(e.target.value as Sortierung)}
          className="feld w-auto"
          aria-label="Sortierung"
        >
          <option value="fuellstand">Füllstand absteigend</option>
          <option value="prognose">Nächste Leerung zuerst</option>
          <option value="haeufigkeit">Häufigste Leerungen zuerst</option>
          <option value="nummer">Nummer</option>
          <option value="ort">Ort</option>
          <option value="messung">Letzte Messung</option>
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={nurOhneSensor}
            onChange={(e) => setNurOhneSensor(e.target.checked)}
          />
          nur ohne Sensor
        </label>

        <span className="ml-auto text-sm text-ink-3">{gefiltert.length} Treffer</span>
      </div>

      <div className="karte-flaeche divide-y overflow-hidden">
        {gefiltert.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">Kein Container passt zur Auswahl.</p>
        )}

        {gefiltert.map((z) => {
          const stufe = stufeVon(z.fuellstand_prozent);
          return (
            <Link
              key={z.id}
              href={`/intern/container/${z.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-flaeche-2"
            >
              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Stufensymbol stufe={stufe} />
                  <span className="font-medium">{z.bezeichnung ?? z.nummer}</span>
                  <span className="zahl text-xs text-ink-3">{z.nummer}</span>
                  {z.status !== "aktiv" && (
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">{z.status}</span>
                  )}
                  {!z.oeffentlich && (
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">nicht öffentlich</span>
                  )}
                </div>
                <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(z) || "keine Adresse hinterlegt"}</div>
                <div className="mt-0.5 pl-6 text-xs">
                  {z.standort_name ? (
                    <span className="text-ink-3">Standort: {z.standort_name}</span>
                  ) : (
                    <span style={{ color: "var(--ernst)" }}>
                      ohne Standort – taucht in keiner Tour auf
                    </span>
                  )}
                </div>
              </div>

              <div className="w-full max-w-[220px]">
                <Fuellstandsbalken prozent={z.fuellstand_prozent} />
                <div className="mt-1 text-xs text-ink-3">{alterText(z.gemessen_am)}</div>
              </div>

              <div className="w-full text-xs sm:w-40">
                <div className="text-ink-3">Nächste Leerung</div>
                {z.tage_bis_tour === null ? (
                  <div className="text-ink-3">–</div>
                ) : (
                  <div className="font-medium text-ink-2">
                    {tageText(z.tage_bis_tour)}
                    <span className="zahl ml-1 font-normal text-ink-3">
                      {prognoseDatum(z.prognose_tour_am)}
                    </span>
                  </div>
                )}
                <div className="mt-0.5 text-ink-3">
                  {z.mittel_tage === null ? (
                    "kein Rhythmus"
                  ) : (
                    <>
                      {rhythmusText(z.mittel_tage)} · {jahresText(z.leerungen_pro_jahr)}
                    </>
                  )}
                </div>
              </div>

              <div className="w-full text-xs text-ink-3 sm:w-44 sm:text-right">
                {z.sensor_geraete_id ? (
                  <>
                    <span className="zahl">{z.sensor_geraete_id}</span>
                    {!z.kalibriert && <span> · nicht kalibriert</span>}
                  </>
                ) : (
                  <span>kein Sensor</span>
                )}
                <div>seit {formatDatum(z.aufstelldatum)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
