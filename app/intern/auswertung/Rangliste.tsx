"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Stufensymbol } from "@/components/Stufensymbol";
import { adresse, prozentText, stufeVon } from "@/lib/fuellstand";
import { jahresText, prognoseDatum, rhythmusText, tageText } from "@/lib/prognose";

export interface Auswertungszeile {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  fuellstand_prozent: number | null;
  leerungen_gesamt: number;
  abstaende_anzahl: number;
  mittel_tage: number | null;
  streuung_tage: number | null;
  kuerzester_abstand_tage: number | null;
  laengster_abstand_tage: number | null;
  leerungen_pro_jahr: number | null;
  letzte_leerung_am: string | null;
  tage_seit_letzter_leerung: number | null;
  tage_bis_tour: number | null;
  prognose_tour_am: string | null;
}

type Sortierung = "haeufigkeit" | "seltenheit" | "prognose" | "nummer" | "ort";

const ZAHL = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function Rangliste({ zeilen }: { zeilen: Auswertungszeile[] }) {
  const [suche, setSuche] = useState("");
  const [sortierung, setSortierung] = useState<Sortierung>("haeufigkeit");
  const [nurMitRhythmus, setNurMitRhythmus] = useState(true);

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();

    const liste = zeilen.filter((z) => {
      if (nurMitRhythmus && z.mittel_tage === null) return false;
      if (!text) return true;
      return [z.nummer, z.bezeichnung, z.strasse, z.plz, z.ort]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
    });

    const sortiert = [...liste];
    sortiert.sort((a, b) => {
      switch (sortierung) {
        case "seltenheit":
          return (a.leerungen_pro_jahr ?? Infinity) - (b.leerungen_pro_jahr ?? Infinity);
        case "prognose":
          return (a.tage_bis_tour ?? Infinity) - (b.tage_bis_tour ?? Infinity);
        case "nummer":
          return a.nummer.localeCompare(b.nummer, "de");
        case "ort":
          return (a.ort ?? "").localeCompare(b.ort ?? "", "de") || a.nummer.localeCompare(b.nummer, "de");
        default:
          // Ohne Rhythmus ans Ende - eine fehlende Zahl ist keine Null.
          return (b.leerungen_pro_jahr ?? -1) - (a.leerungen_pro_jahr ?? -1);
      }
    });
    return sortiert;
  }, [zeilen, suche, sortierung, nurMitRhythmus]);

  const mitRhythmus = gefiltert.filter((z) => z.leerungen_pro_jahr !== null);
  const summeProJahr = mitRhythmus.reduce((s, z) => s + (z.leerungen_pro_jahr ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Nummer, Standort, Ort …"
          className="feld w-auto min-w-[14rem] flex-1"
          aria-label="Suche"
        />

        <select
          value={sortierung}
          onChange={(e) => setSortierung(e.target.value as Sortierung)}
          className="feld w-auto"
          aria-label="Sortierung"
        >
          <option value="haeufigkeit">Häufigste Leerungen zuerst</option>
          <option value="seltenheit">Seltenste zuerst</option>
          <option value="prognose">Nächste Leerung zuerst</option>
          <option value="nummer">Nummer</option>
          <option value="ort">Ort</option>
        </select>

        <label className="inline-flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={nurMitRhythmus}
            onChange={(e) => setNurMitRhythmus(e.target.checked)}
          />
          nur mit Rhythmus
        </label>

        <span className="ml-auto text-sm text-ink-3">{gefiltert.length} Container</span>
      </div>

      {mitRhythmus.length > 0 && (
        <p className="text-sm text-ink-2">
          Zusammen <span className="zahl font-medium">{ZAHL.format(Math.round(summeProJahr))}</span> Leerungen
          im Jahr über {mitRhythmus.length} Container mit belastbarem Rhythmus.
        </p>
      )}

      <div className="karte-flaeche overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-ink-3">
              <th className="px-4 py-2 font-medium">Container</th>
              <th className="px-4 py-2 text-right font-medium">Ø Abstand</th>
              <th className="px-4 py-2 text-right font-medium">Pro Jahr</th>
              <th className="px-4 py-2 text-right font-medium">Spanne</th>
              <th className="px-4 py-2 text-right font-medium">Leerungen</th>
              <th className="px-4 py-2 text-right font-medium">Füllstand</th>
              <th className="px-4 py-2 text-right font-medium">Nächste Leerung</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {gefiltert.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-ink-3">
                  Kein Container passt zur Auswahl.
                </td>
              </tr>
            )}

            {gefiltert.map((z) => (
              <tr key={z.id} className="transition hover:bg-flaeche-2">
                <td className="px-4 py-2">
                  <Link href={`/intern/container/${z.id}`} className="flex items-center gap-2">
                    <Stufensymbol stufe={stufeVon(z.fuellstand_prozent)} />
                    <span>
                      <span className="font-medium">{z.bezeichnung ?? z.nummer}</span>
                      <span className="zahl ml-2 text-xs text-ink-3">{z.nummer}</span>
                      <span className="block text-xs text-ink-3">{adresse(z) || "keine Adresse"}</span>
                    </span>
                  </Link>
                </td>
                <td className="zahl px-4 py-2 text-right">
                  {z.mittel_tage === null ? "–" : rhythmusText(z.mittel_tage).replace("alle ", "")}
                </td>
                <td className="zahl px-4 py-2 text-right font-medium">
                  {z.leerungen_pro_jahr === null ? "–" : ZAHL.format(z.leerungen_pro_jahr)}
                </td>
                <td className="zahl px-4 py-2 text-right text-xs text-ink-3">
                  {z.kuerzester_abstand_tage === null
                    ? "–"
                    : `${ZAHL.format(z.kuerzester_abstand_tage)}–${ZAHL.format(z.laengster_abstand_tage ?? 0)} T`}
                </td>
                <td className="zahl px-4 py-2 text-right text-ink-2">{z.leerungen_gesamt}</td>
                <td className="zahl px-4 py-2 text-right">{prozentText(z.fuellstand_prozent)}</td>
                <td className="px-4 py-2 text-right">
                  {z.tage_bis_tour === null ? (
                    <span className="text-ink-3">–</span>
                  ) : (
                    <>
                      <span className="font-medium">{tageText(z.tage_bis_tour)}</span>
                      <span className="zahl block text-xs text-ink-3">
                        {prognoseDatum(z.prognose_tour_am)}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
