"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { adresse } from "@/lib/fuellstand";
import { tageText } from "@/lib/prognose";
import {
  euroText,
  istTeuer,
  kennzahlText,
  stoppKosten,
  tourdurchschnitt,
  type Kostensaetze,
  type Stoppkosten,
} from "@/lib/kosten";
import { kartenAbschnitte, routePlanen, umwegKm, type Ort } from "@/lib/route";
import type { Tourzeile } from "./page";

type Reihenfolge = "strecke" | "dringlichkeit";

const KM = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const L = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

const GRUND_TEXT: Record<Tourzeile["grund"], string> = {
  zu_lange_voll: "steht zu lange voll",
  meldung: "Meldung offen",
  ungedeckt: "keine Regeltour rechtzeitig",
  laeuft_voll: "läuft demnächst über",
  mitnahme: "Regeltour kommt – könnte man mitnehmen",
};

const DATUM = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
const datumText = (wert: string | null) => (wert ? DATUM.format(new Date(wert)) : "–");

export function Tourenansicht({
  zeilen,
  betriebshof,
  saetze,
}: {
  zeilen: Tourzeile[];
  betriebshof: (Ort & { name?: string }) | null;
  saetze: Kostensaetze;
}) {
  const [standort, setStandort] = useState<Ort | null>(null);
  const [startWahl, setStartWahl] = useState<"standort" | "betriebshof" | "ohne">(
    betriebshof ? "betriebshof" : "ohne",
  );
  const [reihenfolge, setReihenfolge] = useState<Reihenfolge>("strecke");
  const [rundfahrt, setRundfahrt] = useState(true);
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  const [mitnehmen, setMitnehmen] = useState<Set<string>>(new Set());
  const [ortungLaeuft, setOrtungLaeuft] = useState(false);
  const [ortungsfehler, setOrtungsfehler] = useState<string | null>(null);

  const start: Ort | null =
    startWahl === "standort" ? standort : startWahl === "betriebshof" ? betriebshof : null;

  // Pflicht fährt ohnehin; was von "Kann" angehakt ist, kommt dazu.
  const { gesetzt, offen, ohneKoordinaten } = useMemo(() => {
    const gesetzt: (Tourzeile & Ort)[] = [];
    const offen: Tourzeile[] = [];
    const ohneKoordinaten: Tourzeile[] = [];

    for (const z of zeilen) {
      const dabei = z.zustand === "pflicht" || mitnehmen.has(z.standort_id);
      if (z.lat === null || z.lng === null) {
        if (dabei) ohneKoordinaten.push(z);
        else offen.push(z);
        continue;
      }
      if (dabei) gesetzt.push({ ...z, lat: z.lat, lng: z.lng });
      else offen.push(z);
    }
    return { gesetzt, offen, ohneKoordinaten };
  }, [zeilen, mitnehmen]);

  /**
   * Die Auswahl treffen Kapazität und Deckung, die Reihenfolge die Fahrtstrecke.
   * Beides bleibt getrennt: alle gesetzten Stopps werden ohnehin angefahren,
   * den vollsten zuerst zu nehmen kostet nur Umwege.
   */
  const route = useMemo(() => {
    if (reihenfolge === "dringlichkeit" || gesetzt.length === 0) return null;
    return routePlanen(gesetzt, start, rundfahrt);
  }, [gesetzt, start, rundfahrt, reihenfolge]);

  const geplant = useMemo(() => {
    if (!route) return gesetzt.map((z) => ({ zeile: z, etappe: null as number | null }));
    return route.reihenfolge.map((index, position) => ({
      zeile: gesetzt[index],
      etappe: route.etappen[position],
    }));
  }, [route, gesetzt]);

  /** Kosten der gesetzten Stopps - Maßstab für alles Weitere. */
  const kostenGesetzt = useMemo(() => {
    const folge = geplant.map((e) => e.zeile);
    const karte = new Map<string, Stoppkosten>();

    folge.forEach((z, i) => {
      // Umweg dieses Stopps: die Route ohne ihn, er wieder eingefügt.
      const ohneIhn = folge.filter((_, j) => j !== i);
      const k = stoppKosten(
        {
          umwegKm: umwegKm(ohneIhn, start, { lat: z.lat!, lng: z.lng! }, rundfahrt),
          containerAnzahl: z.container_gesamt,
          ertragLiter: Number(z.ertrag_liter ?? 0),
        },
        saetze,
      );
      karte.set(z.standort_id, k);
    });
    return karte;
  }, [geplant, start, rundfahrt, saetze]);

  const schnitt = useMemo(() => tourdurchschnitt([...kostenGesetzt.values()]), [kostenGesetzt]);

  /** Was ein zusätzlicher Stopp kosten würde, gemessen an der geplanten Route. */
  const kostenOffen = useMemo(() => {
    const folge = geplant.map((e) => e.zeile);
    const karte = new Map<string, Stoppkosten>();

    for (const z of offen) {
      if (z.lat === null || z.lng === null) continue;
      karte.set(
        z.standort_id,
        stoppKosten(
          {
            umwegKm: umwegKm(folge, start, { lat: z.lat, lng: z.lng }, rundfahrt),
            containerAnzahl: z.container_gesamt,
            ertragLiter: Number(z.ertrag_liter ?? 0),
          },
          saetze,
        ),
      );
    }
    return karte;
  }, [offen, geplant, start, rundfahrt, saetze]);

  const offeneZiele = geplant.filter((e) => !erledigt.has(e.zeile.standort_id)).map((e) => e.zeile);
  const kartenLinks = kartenAbschnitte(offeneZiele, start);

  function standortHolen() {
    if (!navigator.geolocation) {
      setOrtungsfehler("Dieses Gerät liefert keine Standortdaten.");
      return;
    }
    setOrtungLaeuft(true);
    setOrtungsfehler(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStandort({ lat: position.coords.latitude, lng: position.coords.longitude });
        setStartWahl("standort");
        setOrtungLaeuft(false);
      },
      () => {
        setOrtungsfehler("Kein Zugriff auf den Standort. Bitte die Berechtigung erteilen.");
        setOrtungLaeuft(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function umschalten(id: string) {
    setMitnehmen((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });
  }

  if (zeilen.length === 0) {
    return (
      <div className="karte-flaeche p-8 text-center">
        <p className="font-medium">Nichts zu tun.</p>
        <p className="mt-1 text-sm text-ink-2">
          Alle Standorte haben genug Restkapazität, und wo es knapp wird, kommt die Regeltour
          rechtzeitig vorbei.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Steuerung */}
      <div className="karte-flaeche p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={standortHolen}
            disabled={ortungLaeuft}
            className="knopf-sekundaer"
          >
            {ortungLaeuft
              ? "Standort wird ermittelt …"
              : standort
                ? "Standort aktualisieren"
                : "Standort verwenden"}
          </button>

          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-ink-2">Start</span>
            <select
              value={startWahl}
              onChange={(e) => setStartWahl(e.target.value as typeof startWahl)}
              className="feld w-auto py-1.5"
            >
              <option value="standort" disabled={!standort}>
                Aktueller Standort
              </option>
              {betriebshof && <option value="betriebshof">{betriebshof.name ?? "Betriebshof"}</option>}
              <option value="ohne">Erster Stopp</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-ink-2">Reihenfolge</span>
            <select
              value={reihenfolge}
              onChange={(e) => setReihenfolge(e.target.value as Reihenfolge)}
              className="feld w-auto py-1.5"
            >
              <option value="strecke">Kürzeste Strecke</option>
              <option value="dringlichkeit">Dringlichkeit</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={rundfahrt}
              onChange={(e) => setRundfahrt(e.target.checked)}
            />
            Rückweg zum Start
          </label>

          {route && (
            <span className="ml-auto text-sm text-ink-2">
              {KM.format(route.strecke)} km
              {schnitt !== null && (
                <span className="text-ink-3"> · Schnitt {kennzahlText(schnitt)}</span>
              )}
            </span>
          )}
        </div>

        {ortungsfehler && <p className="mt-2 text-sm text-ink-2">{ortungsfehler}</p>}

        {kartenLinks.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {kartenLinks.map((link, i) => (
              <a
                key={link}
                href={link}
                target="_blank"
                rel="noreferrer noopener"
                className="knopf-sekundaer px-3 py-1.5 text-sm"
              >
                {kartenLinks.length === 1 ? "Tour im Navi öffnen" : `Abschnitt ${i + 1}`}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Pflicht */}
      <div className="karte-flaeche divide-y overflow-hidden">
        {geplant.map(({ zeile, etappe }, index) => {
          const k = kostenGesetzt.get(zeile.standort_id);
          const abgehakt = erledigt.has(zeile.standort_id);
          const zusatz = mitnehmen.has(zeile.standort_id);

          return (
            <div
              key={zeile.standort_id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${abgehakt ? "opacity-50" : ""}`}
            >
              <input
                type="checkbox"
                checked={abgehakt}
                onChange={(e) => {
                  const neu = new Set(erledigt);
                  if (e.target.checked) neu.add(zeile.standort_id);
                  else neu.delete(zeile.standort_id);
                  setErledigt(neu);
                }}
                aria-label={`${zeile.name} erledigt`}
              />

              <div className="min-w-[200px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="zahl text-xs text-ink-3">{index + 1}.</span>
                  <Link
                    href={`/intern/standorte/${zeile.standort_id}`}
                    className={`font-medium ${abgehakt ? "line-through" : ""}`}
                  >
                    {zeile.name}
                  </Link>
                  <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                    {zeile.container_gesamt} Container
                  </span>
                  {zusatz && (
                    <span className="rounded border px-1.5 py-0.5 text-xs text-ink-2">
                      mitgenommen
                    </span>
                  )}
                  {zeile.offene_meldungen > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                      style={{ background: "var(--ernst)" }}
                    >
                      {zeile.offene_meldungen} Meldung{zeile.offene_meldungen > 1 ? "en" : ""}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(zeile)}</div>
                {zeile.zufahrt && (
                  <div className="mt-0.5 pl-6 text-xs text-ink-3">{zeile.zufahrt}</div>
                )}
              </div>

              <div className="w-full max-w-[200px]">
                <Fuellstandsbalken
                  prozent={zeile.freie_prozent === null ? null : Math.round(100 - zeile.freie_prozent)}
                />
                <div className="mt-1 text-xs text-ink-3">
                  {zeile.ertrag_liter !== null && `${L.format(zeile.ertrag_liter)} l holen`}
                  {etappe !== null &&
                    ` · ${KM.format(etappe)} km ab ${index === 0 ? "Start" : "Vorgänger"}`}
                </div>
              </div>

              <div className="w-full text-xs sm:w-44 sm:text-right">
                <div className="text-ink-2">{GRUND_TEXT[zeile.grund]}</div>
                {k && (
                  <div className="text-ink-3">
                    {kennzahlText(k.euroJe100Liter)} · {euroText(k.kosten)}
                  </div>
                )}
                {zusatz && (
                  <button
                    type="button"
                    onClick={() => umschalten(zeile.standort_id)}
                    className="mt-1 underline underline-offset-2"
                  >
                    wieder weglassen
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {ohneKoordinaten.map((z) => (
          <div key={z.standort_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Link href={`/intern/standorte/${z.standort_id}`} className="flex-1 font-medium">
              {z.name}
            </Link>
            <span className="text-xs text-ink-3">
              keine Koordinaten – nicht in der Route enthalten
            </span>
          </div>
        ))}
      </div>

      {/* Kann */}
      {offen.length > 0 && (
        <section className="karte-flaeche overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Könnte man mitnehmen</h2>
            <p className="mt-1 text-sm text-ink-2">
              Diese Standorte sind unter der Reserve, aber eine Regeltour kommt rechtzeitig vorbei.
              Ob sich der Abstecher heute lohnt, sagt der Umweg
              {schnitt !== null && <> – zum Vergleich der Tourschnitt von {kennzahlText(schnitt)}</>}.
            </p>
          </div>

          <div className="divide-y">
            {offen
              .slice()
              .sort((a, b) => {
                const ka = kostenOffen.get(a.standort_id)?.euroJe100Liter ?? Infinity;
                const kb = kostenOffen.get(b.standort_id)?.euroJe100Liter ?? Infinity;
                return ka - kb;
              })
              .map((z) => {
                const k = kostenOffen.get(z.standort_id);
                const teuer = k ? istTeuer(k, schnitt) : false;

                return (
                  <div
                    key={z.standort_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-[200px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/intern/standorte/${z.standort_id}`}
                          className="font-medium"
                        >
                          {z.name}
                        </Link>
                        <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                          {z.container_gesamt} Container
                        </span>
                        {teuer && (
                          <span
                            className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                            style={{ background: "var(--ernst)" }}
                          >
                            lohnt heute nicht
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-sm text-ink-2">{adresse(z)}</div>
                      <div className="mt-0.5 text-xs text-ink-3">
                        {z.routenname
                          ? `${z.routenname} kommt ${datumText(z.naechster_planbesuch_am)}`
                          : "keiner Regeltour zugeordnet"}
                        {z.tage_bis_reserve !== null && ` · Reserve ${tageText(z.tage_bis_reserve)}`}
                      </div>
                    </div>

                    <div className="w-full text-xs sm:w-52 sm:text-right">
                      {k ? (
                        <>
                          <div className={teuer ? "font-medium text-ink" : "text-ink-2"}>
                            {kennzahlText(k.euroJe100Liter)}
                          </div>
                          <div className="text-ink-3">
                            {KM.format(k.umwegKm)} km Umweg · {euroText(k.kosten)} ·{" "}
                            {L.format(k.ertragLiter)} l
                          </div>
                        </>
                      ) : (
                        <div className="text-ink-3">keine Koordinaten</div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => umschalten(z.standort_id)}
                      className="knopf-sekundaer px-3 py-1.5 text-sm"
                    >
                      Mitnehmen
                    </button>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
