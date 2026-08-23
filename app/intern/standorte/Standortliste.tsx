"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { alterText, prozentText, stufeVon } from "@/lib/fuellstand";

export interface Standortcontainer {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  volumen_liter: number | null;
  fuellstand_prozent: number | null;
  gemessen_am: string | null;
}

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
  hat_entsorger: boolean;
  /** Namen der Regeltouren, früheste zuerst. */
  routen: string[];
  container: Standortcontainer[];
}

type Sortierung = "kapazitaet" | "name" | "ort" | "groesse";
type Filter = "alle" | "cluster" | "ungedeckt" | "ohne_bauhof";

const L = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

/**
 * Die Standortliste.
 *
 * Der Balken zeigt den GEFÜLLTEN Anteil, damit er sich wie überall sonst
 * liest: voll ist rot. Die Zahl daneben nennt trotzdem den freien Platz, weil
 * das die Größe ist, nach der entschieden wird.
 *
 * Jede Zeile lässt sich aufklappen und zeigt dann ihre Container. Damit
 * beantwortet die Liste beide Fragen an einer Stelle – „wie voll ist der
 * Platz" und „woraus besteht er" – ohne dass man dafür die Seite wechselt.
 */
export function Standortliste({ zeilen, reserve }: { zeilen: Standortzeile[]; reserve: number }) {
  const [suche, setSuche] = useState("");
  const [sortierung, setSortierung] = useState<Sortierung>("kapazitaet");
  const [filter, setFilter] = useState<Filter>("alle");
  const [offen, setOffen] = useState<Set<string>>(new Set());

  const cluster = zeilen.filter((z) => z.container_gesamt >= 2).length;
  const ungedeckt = zeilen.filter((z) => z.routen.length === 0 && z.aktiv).length;
  const ohneBauhof = zeilen.filter((z) => !z.hat_entsorger && z.aktiv).length;

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();

    const liste = zeilen.filter((z) => {
      if (filter === "cluster" && z.container_gesamt < 2) return false;
      if (filter === "ungedeckt" && (z.routen.length > 0 || !z.aktiv)) return false;
      if (filter === "ohne_bauhof" && (z.hat_entsorger || !z.aktiv)) return false;
      if (!text) return true;

      // Containernummern zählen bei der Suche mit: wer eine Nummer im Kopf
      // hat, soll den Platz finden, ohne die Ansicht zu wechseln.
      return [
        z.name,
        z.strasse,
        z.plz,
        z.ort,
        ...z.routen,
        ...z.container.map((c) => `${c.nummer} ${c.bezeichnung ?? ""}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(text);
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
  }, [zeilen, suche, sortierung, filter]);

  function umschalten(id: string) {
    setOffen((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Name, Ort, Containernummer, Regeltour …"
          className="feld w-auto min-w-[16rem] flex-1"
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

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="feld w-auto"
          aria-label="Filter"
        >
          <option value="alle">Alle ({zeilen.length})</option>
          <option value="cluster">Nur Cluster ({cluster})</option>
          <option value="ungedeckt">Ohne Regeltour ({ungedeckt})</option>
          <option value="ohne_bauhof">Ohne Bauhof ({ohneBauhof})</option>
        </select>

        <span className="ml-auto text-sm text-ink-3">{gefiltert.length} Standorte</span>
      </div>

      <div className="karte-flaeche divide-y overflow-hidden">
        {gefiltert.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">Kein Standort passt zur Auswahl.</p>
        )}

        {gefiltert.map((z) => {
          const gefuellt = z.freie_prozent === null ? null : Math.round(100 - z.freie_prozent);
          const knapp = z.freie_prozent !== null && z.freie_prozent < reserve;
          const aufgeklappt = offen.has(z.id);

          return (
            <div key={z.id}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-flaeche-2">
                {/* Aufklappen ist ein eigener Knopf, kein Teil des Links -
                    sonst käme man nie zum Standort, ohne aufzuklappen. */}
                <button
                  type="button"
                  onClick={() => umschalten(z.id)}
                  disabled={z.container.length === 0}
                  aria-expanded={aufgeklappt}
                  aria-label={`Container von ${z.name} ${aufgeklappt ? "einklappen" : "ausklappen"}`}
                  className="zahl w-6 shrink-0 text-xs text-ink-3 disabled:opacity-30"
                >
                  {z.container.length === 0 ? "–" : aufgeklappt ? "▾" : "▸"}
                </button>

                <Link href={`/intern/standorte/${z.id}`} className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{z.name}</span>
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                      {z.container_gesamt} Container
                    </span>
                    {!z.aktiv && (
                      <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                        inaktiv
                      </span>
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
                    {[z.strasse, [z.plz, z.ort].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(", ") || "keine Adresse hinterlegt"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    {z.routen.length > 0 ? (
                      z.routen.map((r) => (
                        <span key={r} className="rounded border px-1.5 py-0.5 text-ink-2">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-ink-3">keiner Regeltour zugeordnet</span>
                    )}
                    {!z.hat_entsorger && (
                      <span className="text-ink-3">· kein Bauhof, Müll wird mitgenommen</span>
                    )}
                  </div>
                </Link>

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
              </div>

              {/* Die Container des Platzes */}
              {aufgeklappt && z.container.length > 0 && (
                <ul className="divide-y border-t bg-flaeche-2/40">
                  {z.container.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/intern/container/${c.id}`}
                        className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 pl-14 pr-4 text-sm transition hover:bg-flaeche-2"
                      >
                        <Stufensymbol stufe={stufeVon(c.fuellstand_prozent)} />
                        <span className="min-w-[160px] flex-1">
                          <span className="font-medium">{c.bezeichnung ?? c.nummer}</span>
                          <span className="zahl ml-2 text-xs text-ink-3">{c.nummer}</span>
                        </span>
                        <span className="text-xs text-ink-3">
                          {c.volumen_liter ? `${L.format(c.volumen_liter)} l` : "Volumen fehlt"}
                        </span>
                        <span className="text-xs text-ink-3">{alterText(c.gemessen_am)}</span>
                        <span className="zahl w-14 text-right">
                          {prozentText(c.fuellstand_prozent)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
