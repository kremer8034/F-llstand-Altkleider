"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { adresse, alterText, stufeVon } from "@/lib/fuellstand";
import { tageText } from "@/lib/prognose";
import { kartenAbschnitte, routePlanen, type Ort } from "@/lib/route";
import type { Tourzeile } from "./page";

type Reihenfolge = "strecke" | "dringlichkeit";

const KM = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function Tourenansicht({
  zeilen,
  betriebshof,
}: {
  zeilen: Tourzeile[];
  betriebshof: (Ort & { name?: string }) | null;
}) {
  const [standort, setStandort] = useState<Ort | null>(null);
  const [startWahl, setStartWahl] = useState<"standort" | "betriebshof" | "ohne">(
    betriebshof ? "betriebshof" : "ohne",
  );
  const [reihenfolge, setReihenfolge] = useState<Reihenfolge>("strecke");
  const [rundfahrt, setRundfahrt] = useState(true);
  const [erledigt, setErledigt] = useState<Set<string>>(new Set());
  const [ortungLaeuft, setOrtungLaeuft] = useState(false);
  const [ortungsfehler, setOrtungsfehler] = useState<string | null>(null);

  // Ohne Koordinaten lässt sich nichts planen - die Container stehen deshalb
  // getrennt am Ende, statt die Route zu verfälschen.
  const { planbar, ohneKoordinaten } = useMemo(() => {
    const planbar: (Tourzeile & Ort)[] = [];
    const ohneKoordinaten: Tourzeile[] = [];
    for (const z of zeilen) {
      if (z.lat !== null && z.lng !== null) planbar.push({ ...z, lat: z.lat, lng: z.lng });
      else ohneKoordinaten.push(z);
    }
    return { planbar, ohneKoordinaten };
  }, [zeilen]);

  const start: Ort | null =
    startWahl === "standort" ? standort : startWahl === "betriebshof" ? betriebshof : null;

  /**
   * Die Auswahl treffen die Füllstände, die Reihenfolge die Fahrtstrecke.
   * Beides ist getrennt: alle ausgewählten Container werden ohnehin auf
   * derselben Tour geleert, den vollsten zuerst anzufahren kostet nur Umwege.
   */
  const route = useMemo(() => {
    if (reihenfolge === "dringlichkeit" || planbar.length === 0) return null;
    return routePlanen(planbar, start, rundfahrt);
  }, [planbar, start, rundfahrt, reihenfolge]);

  const geplant = useMemo(() => {
    if (!route) return planbar.map((z) => ({ zeile: z, etappe: null as number | null }));
    return route.reihenfolge.map((index, position) => ({
      zeile: planbar[index],
      etappe: route.etappen[position],
    }));
  }, [route, planbar]);

  const offeneZiele = geplant.filter((e) => !erledigt.has(e.zeile.container_id)).map((e) => e.zeile);
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

  const startText =
    startWahl === "standort"
      ? standort
        ? "aktueller Standort"
        : "Standort noch nicht ermittelt"
      : startWahl === "betriebshof"
        ? (betriebshof?.name ?? "Betriebshof")
        : "erster Container";

  return (
    <div className="space-y-3">
      {/* Steuerung */}
      <div className="karte-flaeche p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={standortHolen} disabled={ortungLaeuft} className="knopf-sekundaer">
            {ortungLaeuft ? "Standort wird ermittelt …" : standort ? "Standort aktualisieren" : "Standort verwenden"}
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
              <option value="ohne">Erster Container</option>
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
              <option value="dringlichkeit">Dringendste zuerst</option>
            </select>
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={rundfahrt}
              onChange={(e) => setRundfahrt(e.target.checked)}
              disabled={reihenfolge !== "strecke" || !start}
            />
            Rückweg einrechnen
          </label>
        </div>

        {ortungsfehler && (
          <p className="mt-2 text-sm" style={{ color: "var(--kritisch)" }}>
            {ortungsfehler}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
          <span className="text-ink-2">
            <strong className="text-ink">{planbar.length}</strong> Container zu leeren
          </span>
          {route && (
            <>
              <span className="text-ink-2">
                Fahrtstrecke <strong className="zahl text-ink">{KM.format(route.strecke)} km</strong>
                <span className="text-ink-3"> (Luftlinie)</span>
              </span>
              <span className="text-ink-3">ab {startText}</span>
            </>
          )}
          {reihenfolge === "dringlichkeit" && (
            <span className="text-ink-3">nach Füllstand sortiert – keine Streckenoptimierung</span>
          )}

          {kartenLinks.length > 0 && (
            <span className="ml-auto flex flex-wrap gap-2">
              {kartenLinks.map((link, i) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="knopf-primaer"
                >
                  {kartenLinks.length === 1 ? "Route öffnen" : `Route, Teil ${i + 1}`}
                </a>
              ))}
            </span>
          )}
        </div>

        {kartenLinks.length > 1 && (
          <p className="mt-2 text-xs text-ink-3">
            Google Maps nimmt höchstens zehn Stationen je Aufruf entgegen – die Route ist deshalb in{" "}
            {kartenLinks.length} Abschnitte geteilt, die nahtlos aneinander anschließen.
          </p>
        )}
      </div>

      {/* Tour */}
      <ol className="karte-flaeche divide-y overflow-hidden">
        {geplant.map(({ zeile, etappe }, index) => {
          const stufe = stufeVon(zeile.fuellstand_prozent);
          const abgehakt = erledigt.has(zeile.container_id);

          return (
            <li
              key={zeile.container_id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${abgehakt ? "opacity-45" : ""}`}
            >
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={abgehakt}
                  onChange={(e) => {
                    const neu = new Set(erledigt);
                    if (e.target.checked) neu.add(zeile.container_id);
                    else neu.delete(zeile.container_id);
                    setErledigt(neu);
                  }}
                  aria-label="Als abgearbeitet markieren"
                />
                <span className="zahl w-6 text-right text-sm font-semibold text-ink-3">{index + 1}.</span>
              </label>

              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Stufensymbol stufe={stufe} />
                  <Link
                    href={`/intern/container/${zeile.container_id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {zeile.bezeichnung ?? zeile.nummer}
                  </Link>
                  <span className="zahl text-xs text-ink-3">{zeile.nummer}</span>
                  {zeile.offene_meldungen > 0 && (
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                      style={{ background: "var(--ernst)" }}
                    >
                      {zeile.offene_meldungen} Meldung{zeile.offene_meldungen > 1 ? "en" : ""}
                    </span>
                  )}
                  {zeile.grund === "prognose" && (
                    <span
                      className="rounded border px-1.5 py-0.5 text-xs font-medium text-ink-2"
                      title="Noch unter der Schwelle, wird laut Hochrechnung aber demnächst fällig"
                    >
                      vorausschauend
                    </span>
                  )}
                </div>
                <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(zeile)}</div>
              </div>

              <div className="w-full max-w-[200px]">
                <Fuellstandsbalken prozent={zeile.fuellstand_prozent} />
                <div className="mt-1 text-xs text-ink-3">
                  {alterText(zeile.gemessen_am)}
                  {zeile.tage_bis_tour !== null && ` · fällig ${tageText(zeile.tage_bis_tour)}`}
                  {etappe !== null && ` · ${KM.format(etappe)} km ab ${index === 0 ? "Start" : "Vorgänger"}`}
                </div>
              </div>

              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${zeile.lat},${zeile.lng}&travelmode=driving`}
                target="_blank"
                rel="noreferrer noopener"
                className="knopf-sekundaer shrink-0"
              >
                Navigation
              </a>
            </li>
          );
        })}

        {route?.rueckweg != null && (
          <li className="flex items-center gap-3 px-4 py-3 text-sm text-ink-3">
            <span className="w-[52px]" />
            Rückweg zum Start: <span className="zahl">{KM.format(route.rueckweg)} km</span>
          </li>
        )}
      </ol>

      {ohneKoordinaten.length > 0 && (
        <div className="karte-flaeche p-4">
          <h2 className="text-sm font-semibold">Ohne Koordinaten – nicht einplanbar</h2>
          <p className="mt-1 text-xs text-ink-3">
            Diesen Containern fehlen Breiten- und Längengrad. Sie sind zu leeren, tauchen aber in der
            Route nicht auf.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {ohneKoordinaten.map((z) => (
              <li key={z.container_id}>
                <Link
                  href={`/intern/container/${z.container_id}`}
                  className="underline underline-offset-2"
                >
                  {z.bezeichnung ?? z.nummer}
                </Link>
                <span className="text-ink-2"> – {adresse(z) || "keine Adresse"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink-3">
        Die Reihenfolge ist auf die kürzeste Gesamtstrecke gerechnet, nicht auf den Füllstand: alle
        aufgeführten Container werden auf derselben Tour geleert, den vollsten zuerst anzufahren
        brächte nichts und kostete Umwege. Gerechnet wird mit Luftlinie – die Kilometerangabe ist ein
        Anhaltswert, die Reihenfolge stimmt. Die Haken dienen der Übersicht während der Fahrt und
        werden nicht gespeichert; die Leerung selbst wird auf der Containerseite erfasst.
      </p>
    </div>
  );
}
