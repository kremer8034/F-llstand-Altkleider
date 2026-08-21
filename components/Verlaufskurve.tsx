"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDatumZeit } from "@/lib/fuellstand";

export interface Verlaufspunkt {
  zeit: string;
  prozent: number | null;
}

const RAND = { oben: 14, rechts: 18, unten: 30, links: 36 };

/**
 * Fuellstandsverlauf eines Containers. Eine einzige Datenreihe - deshalb keine
 * Legende (die Ueberschrift benennt sie), dafuer ein Fadenkreuz mit Tooltip und
 * eine umschaltbare Tabellenansicht.
 */
export function Verlaufskurve({
  punkte,
  leerungen = [],
  schwelleVoll = 90,
  hoehe = 240,
  ueberschrift = "Fuellstandsverlauf",
}: {
  punkte: Verlaufspunkt[];
  leerungen?: string[];
  schwelleVoll?: number;
  hoehe?: number;
  ueberschrift?: string;
}) {
  const behaelter = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(640);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const [tabelle, setTabelle] = useState(false);

  useEffect(() => {
    if (!behaelter.current) return;
    const beobachter = new ResizeObserver(([eintrag]) => {
      setBreite(Math.max(280, eintrag.contentRect.width));
    });
    beobachter.observe(behaelter.current);
    return () => beobachter.disconnect();
  }, []);

  const daten = useMemo(
    () =>
      punkte
        .filter((p) => p.prozent !== null)
        .map((p) => ({ t: new Date(p.zeit).getTime(), y: p.prozent as number, zeit: p.zeit }))
        .sort((a, b) => a.t - b.t),
    [punkte],
  );

  const plotBreite = breite - RAND.links - RAND.rechts;
  const plotHoehe = hoehe - RAND.oben - RAND.unten;

  const { tMin, tSpanne } = useMemo(() => {
    if (daten.length === 0) return { tMin: 0, tSpanne: 1 };
    const min = daten[0].t;
    const max = daten[daten.length - 1].t;
    return { tMin: min, tSpanne: Math.max(1, max - min) };
  }, [daten]);

  const x = (t: number) => RAND.links + ((t - tMin) / tSpanne) * plotBreite;
  const y = (wert: number) => RAND.oben + (1 - wert / 100) * plotHoehe;

  const linie = daten.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(1)} ${y(d.y).toFixed(1)}`).join(" ");
  const flaeche =
    daten.length > 1
      ? `${linie} L${x(daten[daten.length - 1].t).toFixed(1)} ${(RAND.oben + plotHoehe).toFixed(1)} ` +
        `L${x(daten[0].t).toFixed(1)} ${(RAND.oben + plotHoehe).toFixed(1)} Z`
      : "";

  const zeitFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });

  const xTicks = useMemo(() => {
    if (daten.length < 2) return [];
    const anzahl = Math.min(6, Math.max(2, Math.floor(plotBreite / 90)));
    return Array.from({ length: anzahl }, (_, i) => tMin + (tSpanne * i) / (anzahl - 1));
  }, [daten.length, plotBreite, tMin, tSpanne]);

  function beiBewegung(ereignis: React.PointerEvent<SVGSVGElement>) {
    if (daten.length === 0) return;
    const kasten = ereignis.currentTarget.getBoundingClientRect();
    const px = ereignis.clientX - kasten.left;
    let naechster = 0;
    let abstand = Infinity;
    daten.forEach((d, i) => {
      const a = Math.abs(x(d.t) - px);
      if (a < abstand) {
        abstand = a;
        naechster = i;
      }
    });
    setAktiv(naechster);
  }

  if (daten.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border text-sm text-ink-3">
        Noch keine Messwerte vorhanden.
      </div>
    );
  }

  const aktiverPunkt = aktiv !== null ? daten[aktiv] : null;

  return (
    <div ref={behaelter} className="w-full">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{ueberschrift}</h3>
        <button
          type="button"
          onClick={() => setTabelle((t) => !t)}
          className="text-xs font-medium text-ink-3 underline underline-offset-2 hover:text-ink-2"
        >
          {tabelle ? "Kurve anzeigen" : "Als Tabelle"}
        </button>
      </div>

      {tabelle ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <table className="tabelle">
            <thead className="sticky top-0 bg-flaeche">
              <tr>
                <th>Zeitpunkt</th>
                <th className="text-right">Fuellstand</th>
              </tr>
            </thead>
            <tbody>
              {[...daten].reverse().map((d) => (
                <tr key={d.t}>
                  <td className="text-ink-2">{formatDatumZeit(d.zeit)}</td>
                  <td className="zahl text-right font-medium">{d.y} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            width={breite}
            height={hoehe}
            onPointerMove={beiBewegung}
            onPointerLeave={() => setAktiv(null)}
            style={{ touchAction: "pan-y" }}
            role="img"
            aria-label={`${ueberschrift}: ${daten.length} Messwerte`}
          >
            {/* Gitter: durchgezogene Haarlinien, zuruecktretend */}
            {[0, 25, 50, 75, 100].map((wert) => (
              <g key={wert}>
                <line
                  x1={RAND.links}
                  x2={breite - RAND.rechts}
                  y1={y(wert)}
                  y2={y(wert)}
                  stroke="var(--linie)"
                  strokeWidth="1"
                />
                <text
                  x={RAND.links - 8}
                  y={y(wert) + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--ink-3)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {wert}
                </text>
              </g>
            ))}

            {/* Schwellwert "voll" - hier ist die Strichelung inhaltlich richtig */}
            <line
              x1={RAND.links}
              x2={breite - RAND.rechts}
              y1={y(schwelleVoll)}
              y2={y(schwelleVoll)}
              stroke="var(--kritisch)"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <text
              x={breite - RAND.rechts}
              y={y(schwelleVoll) - 5}
              textAnchor="end"
              fontSize="10"
              fill="var(--ink-3)"
            >
              voll ab {schwelleVoll} %
            </text>

            {/* Leerungen als Markierung auf der Grundlinie */}
            {leerungen.map((zeitpunkt) => {
              const t = new Date(zeitpunkt).getTime();
              if (t < tMin || t > tMin + tSpanne) return null;
              return (
                <g key={zeitpunkt}>
                  <line
                    x1={x(t)}
                    x2={x(t)}
                    y1={RAND.oben}
                    y2={RAND.oben + plotHoehe}
                    stroke="var(--achse)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={x(t)}
                    cy={RAND.oben + plotHoehe}
                    r="3.5"
                    fill="var(--gut)"
                    stroke="var(--flaeche)"
                    strokeWidth="2"
                  />
                </g>
              );
            })}

            {/* Flaeche als leiser Hauch, dann die Linie */}
            {flaeche && <path d={flaeche} fill="var(--serie-wash)" />}
            <path
              d={linie}
              fill="none"
              stroke="var(--serie)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Endpunkt hervorheben */}
            <circle
              cx={x(daten[daten.length - 1].t)}
              cy={y(daten[daten.length - 1].y)}
              r="4"
              fill="var(--serie)"
              stroke="var(--flaeche)"
              strokeWidth="2"
            />

            {/* Grundlinie und Zeitachse */}
            <line
              x1={RAND.links}
              x2={breite - RAND.rechts}
              y1={RAND.oben + plotHoehe}
              y2={RAND.oben + plotHoehe}
              stroke="var(--achse)"
              strokeWidth="1"
            />
            {xTicks.map((t, i) => (
              <text
                key={t}
                x={x(t)}
                y={hoehe - 10}
                textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
                fontSize="11"
                fill="var(--ink-3)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {zeitFormat.format(new Date(t))}
              </text>
            ))}

            {/* Fadenkreuz */}
            {aktiverPunkt && (
              <g>
                <line
                  x1={x(aktiverPunkt.t)}
                  x2={x(aktiverPunkt.t)}
                  y1={RAND.oben}
                  y2={RAND.oben + plotHoehe}
                  stroke="var(--achse)"
                  strokeWidth="1"
                />
                <circle
                  cx={x(aktiverPunkt.t)}
                  cy={y(aktiverPunkt.y)}
                  r="5"
                  fill="var(--serie)"
                  stroke="var(--flaeche)"
                  strokeWidth="2"
                />
              </g>
            )}
          </svg>

          {aktiverPunkt && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border bg-flaeche px-3 py-2 text-xs shadow-lg"
              style={{
                left: Math.min(Math.max(x(aktiverPunkt.t) - 70, 0), Math.max(0, breite - 150)),
                top: 4,
                minWidth: 140,
              }}
            >
              <div className="text-ink-3">{formatDatumZeit(aktiverPunkt.zeit)}</div>
              <div className="zahl mt-0.5 text-sm font-semibold text-ink">{aktiverPunkt.y} % gefuellt</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
