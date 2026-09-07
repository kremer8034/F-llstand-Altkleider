"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDatumZeit } from "@/lib/fuellstand";

export interface Verlaufspunkt {
  zeit: string;
  wert: number | null;
}

export interface Schwelle {
  wert: number;
  text: string;
}

const RAND = { oben: 14, rechts: 18, unten: 30, links: 42 };
// Ohne eigene Zeitachse braucht die Kurve unten nur Luft, keinen Platz fuer
// Beschriftung - sonst klafft eine Luecke zur Kurve darunter.
const UNTEN_OHNE_ACHSE = 6;

/**
 * Achsenteilung auf runde Schritte. Ohne das steht an der Volt-Achse
 * "3,13 / 3,35 / 3,58" - rechnerisch die Viertel der Rohgrenzen, zum Ablesen
 * unbrauchbar. Gesucht ist der kleinste Schritt aus 1/2/2,5/5 mal einer
 * Zehnerpotenz, der noch ein Viertel der Spanne abdeckt; die Grenzen wandern
 * dann nach aussen auf ein Vielfaches davon.
 */
function nettesRaster(min: number, max: number) {
  const roh = Math.max((max - min) / 4, 1e-9);
  const groesse = Math.pow(10, Math.floor(Math.log10(roh)));
  const schritt =
    [1, 2, 2.5, 5, 10].map((f) => f * groesse).find((s) => s >= roh) ?? 10 * groesse;
  const unten = Math.floor(min / schritt) * schritt;
  const oben = Math.ceil(max / schritt) * schritt;
  const anzahl = Math.round((oben - unten) / schritt);
  return {
    unten,
    oben,
    // Nachkommastellen des Schritts sauber wegrunden - 0.1 * 3 waere sonst
    // 0.30000000000000004 und stuende so als Beschriftung da.
    ticks: Array.from({ length: anzahl + 1 }, (_, i) =>
      Math.round((unten + i * schritt) * 1e6) / 1e6,
    ),
  };
}

/**
 * Ein Messwert eines Containers im Zeitverlauf - Fuellstand oder Batterie.
 * Immer eine einzige Datenreihe, deshalb keine Legende (die Ueberschrift
 * benennt sie), dafuer ein Fadenkreuz mit Tooltip und eine umschaltbare
 * Tabellenansicht.
 *
 * Zwei Groessen kommen bewusst NICHT in eine Kurve mit zwei y-Achsen. Zwei
 * Achsen laden dazu ein, aus dem Schnittpunkt zweier Linien einen
 * Zusammenhang zu lesen, den es nicht gibt - der Punkt haengt allein daran,
 * wie man die Achsen skaliert hat. Zwei Kurven untereinander auf derselben
 * Zeitachse zeigen dasselbe, ohne diese Falle.
 */
export function Verlaufskurve({
  punkte,
  leerungen = [],
  schwelle = null,
  hoehe = 240,
  ueberschrift,
  einheit = "%",
  yMin = 0,
  yMax = 100,
  nachkommastellen = 0,
  farbe = "var(--serie)",
  wash = "var(--serie-wash)",
  flaeche: mitFlaecheGewuenscht = true,
  zeitachse = true,
  eigeneTabelle = true,
  von,
  bis,
  spaltenname = "Wert",
  leerText = "Noch keine Messwerte vorhanden.",
}: {
  punkte: Verlaufspunkt[];
  leerungen?: string[];
  schwelle?: Schwelle | null;
  hoehe?: number;
  ueberschrift: string;
  einheit?: string;
  /**
   * Untere Kante der Wertachse. Fuer Prozent bleibt sie bei 0. Eine
   * Zellenspannung dagegen faengt nicht bei 0 V an - eine Lithiumzelle geht im
   * Betrieb nie unter 3 V, und auf einer 0..4er Achse waere ihr ganzer
   * Verlauf ein Strich am oberen Rand. Sobald die Achse nicht bei 0 beginnt,
   * entfaellt die Flaeche unter der Linie von selbst: eine Flaeche misst vom
   * Nullpunkt, und ueber einer abgeschnittenen Achse wuerde sie luegen.
   */
  yMin?: number;
  yMax?: number;
  nachkommastellen?: number;
  farbe?: string;
  wash?: string;
  /**
   * Flaeche unter der Linie. An der fuehrenden Kurve richtig - sie gibt ihr
   * Gewicht. An einer Nebenkurve falsch: zwei gleich satte Flaechen
   * uebereinander sagen dem Auge, beide seien gleich wichtig.
   */
  flaeche?: boolean;
  /**
   * Eigene Zeitachse. Stehen zwei Kurven auf derselben Achse untereinander,
   * traegt nur die untere die Beschriftung - zweimal dieselben Datumsangaben
   * sind doppelte Tinte und trennen, was zusammengehoert.
   */
  zeitachse?: boolean;
  /**
   * Eigener Umschalter "Als Tabelle". Aus, wenn mehrere Kurven zusammen einen
   * Bereich bilden: dort gehoert eine Tabelle hin, die alle Reihen
   * nebeneinanderstellt, und ein Umschalter statt einer je Kurve.
   */
  eigeneTabelle?: boolean;
  /** Feste Zeitachse. Fehlt sie, spannt die Kurve ueber ihre eigenen Daten. */
  von?: string | number;
  bis?: string | number;
  spaltenname?: string;
  leerText?: string;
}) {
  const behaelter = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(640);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const [tabelle, setTabelle] = useState(false);

  // Die Breite kommt aus drei Quellen, und das ist Absicht. Der
  // ResizeObserver allein hat sich als zu wenig erwiesen: meldet er einmal
  // eine Breite aus einem Zwischenzustand des Layouts und aendert sich danach
  // nichts mehr, bleibt die Kurve stumm auf einem Viertel der Kachel stehen -
  // ohne Fehler, ohne dass es jemandem auffaellt. Deshalb zusaetzlich eine
  // Messung direkt nach dem Einhaengen (noch vor dem ersten Bild) und eine
  // beim Fenstergroessenwechsel.
  const messen = useCallback(() => {
    const b = behaelter.current?.getBoundingClientRect().width;
    if (b && b > 0) setBreite(Math.max(280, b));
  }, []);

  useLayoutEffect(messen, [messen]);

  useEffect(() => {
    if (!behaelter.current) return;
    const beobachter = new ResizeObserver(messen);
    beobachter.observe(behaelter.current);
    window.addEventListener("resize", messen);
    return () => {
      beobachter.disconnect();
      window.removeEventListener("resize", messen);
    };
  }, [messen]);

  const daten = useMemo(
    () =>
      punkte
        .filter((p) => p.wert !== null && Number.isFinite(p.wert))
        .map((p) => ({ t: new Date(p.zeit).getTime(), y: p.wert as number, zeit: p.zeit }))
        .sort((a, b) => a.t - b.t),
    [punkte],
  );

  const plotBreite = breite - RAND.links - RAND.rechts;
  const randUnten = zeitachse ? RAND.unten : UNTEN_OHNE_ACHSE;
  const plotHoehe = hoehe - RAND.oben - randUnten;

  // Die Zeitachse kommt von aussen, wenn zwei Kurven untereinander stehen:
  // sonst spannt jede ueber ihre eigenen Daten, und zwei Kurven mit
  // unterschiedlich langer Messhistorie stuenden untereinander mit
  // verschobenen Achsen - genau der Vergleich, um den es hier geht, waere
  // dann falsch.
  const { tMin, tSpanne } = useMemo(() => {
    const aussen =
      von !== undefined && bis !== undefined
        ? { a: new Date(von).getTime(), b: new Date(bis).getTime() }
        : null;
    if (aussen && Number.isFinite(aussen.a) && Number.isFinite(aussen.b)) {
      return { tMin: aussen.a, tSpanne: Math.max(1, aussen.b - aussen.a) };
    }
    if (daten.length === 0) return { tMin: 0, tSpanne: 1 };
    return {
      tMin: daten[0].t,
      tSpanne: Math.max(1, daten[daten.length - 1].t - daten[0].t),
    };
  }, [daten, von, bis]);

  const x = (t: number) => RAND.links + ((t - tMin) / tSpanne) * plotBreite;

  const raster = useMemo(() => nettesRaster(yMin, yMax), [yMin, yMax]);
  const ySpanne = Math.max(1e-9, raster.oben - raster.unten);
  const y = (wert: number) =>
    RAND.oben +
    (1 - (Math.min(Math.max(wert, raster.unten), raster.oben) - raster.unten) / ySpanne) *
      plotHoehe;
  // Eine Flaeche misst vom Nullpunkt. Faengt die Achse woanders an, faellt sie
  // weg - sonst stuende dort eine Menge, die es nicht gibt.
  const mitFlaeche = mitFlaecheGewuenscht && raster.unten <= 0;

  const zahlText = (wert: number) =>
    wert.toLocaleString("de-DE", {
      minimumFractionDigits: nachkommastellen,
      maximumFractionDigits: nachkommastellen,
    });

  // Ein stiller Sensor darf keine Gerade quer durch die Luecke ziehen: das
  // saehe aus wie ein gleichmaessiger Verlauf, wo in Wahrheit nichts gemessen
  // wurde. Ab dem Vierfachen des ueblichen Abstands bricht die Linie deshalb
  // ab und setzt danach neu an.
  const abschnitte = useMemo(() => {
    if (daten.length === 0) return [] as (typeof daten)[];
    const abstaende = daten.slice(1).map((d, i) => d.t - daten[i].t).sort((a, b) => a - b);
    const mittlerer = abstaende.length > 0 ? abstaende[Math.floor(abstaende.length / 2)] : 0;
    const grenze = Math.max(mittlerer * 4, tSpanne / 40);

    const teile: (typeof daten)[] = [[daten[0]]];
    daten.slice(1).forEach((d, i) => {
      if (d.t - daten[i].t > grenze) teile.push([d]);
      else teile[teile.length - 1].push(d);
    });
    return teile;
  }, [daten, tSpanne]);

  const grundlinie = (RAND.oben + plotHoehe).toFixed(1);

  const pfade = abschnitte.map((abschnitt) => {
    const linie = abschnitt
      .map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(1)} ${y(d.y).toFixed(1)}`)
      .join(" ");
    const flaeche =
      mitFlaeche && abschnitt.length > 1
        ? `${linie} L${x(abschnitt[abschnitt.length - 1].t).toFixed(1)} ${grundlinie} ` +
          `L${x(abschnitt[0].t).toFixed(1)} ${grundlinie} Z`
        : "";
    return { linie, flaeche, schluessel: abschnitt[0].t };
  });

  // Ueber ein Jahr sagt "07.09." nichts mehr - dann gehoert das Jahr dazu.
  const zeitFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(
        "de-DE",
        tSpanne > 200 * 86400_000
          ? { month: "2-digit", year: "2-digit" }
          : { day: "2-digit", month: "2-digit" },
      ),
    [tSpanne],
  );

  const xTicks = useMemo(() => {
    if (!zeitachse) return [];
    const anzahl = Math.min(6, Math.max(2, Math.floor(plotBreite / 90)));
    return Array.from({ length: anzahl }, (_, i) => tMin + (tSpanne * i) / (anzahl - 1));
  }, [zeitachse, plotBreite, tMin, tSpanne]);

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

  const kopf = (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold text-ink">{ueberschrift}</h3>
      {eigeneTabelle && daten.length > 0 && (
        <button
          type="button"
          onClick={() => setTabelle((t) => !t)}
          className="text-xs font-medium text-ink-3 underline underline-offset-2 hover:text-ink-2"
        >
          {tabelle ? "Kurve anzeigen" : "Als Tabelle"}
        </button>
      )}
    </div>
  );

  if (daten.length === 0) {
    return (
      <div ref={behaelter} className="w-full">
        {kopf}
        <div className="flex h-40 items-center justify-center rounded-lg border text-sm text-ink-3">
          {leerText}
        </div>
      </div>
    );
  }

  const aktiverPunkt = aktiv !== null ? daten[aktiv] : null;
  const letzter = daten[daten.length - 1];

  return (
    <div ref={behaelter} className="w-full">
      {kopf}

      {eigeneTabelle && tabelle ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          <table className="tabelle">
            <thead className="sticky top-0 bg-flaeche">
              <tr>
                <th>Zeitpunkt</th>
                <th className="text-right">{spaltenname}</th>
              </tr>
            </thead>
            <tbody>
              {[...daten].reverse().map((d) => (
                <tr key={d.t}>
                  <td className="text-ink-2">{formatDatumZeit(d.zeit)}</td>
                  <td className="zahl text-right font-medium">
                    {zahlText(d.y)} {einheit}
                  </td>
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
            aria-label={`${ueberschrift}: ${daten.length} Messwerte, zuletzt ${zahlText(
              letzter.y,
            )} ${einheit} am ${formatDatumZeit(letzter.zeit)}`}
          >
            {/* Zeitraum ohne Messwerte kenntlich machen. Ein frisch angelernter
                Sensor hat bei "letztes Jahr" eine Handvoll Punkte ganz rechts
                und links davon nichts - ohne diese Flaeche sieht das aus wie
                ein Container, der ein Jahr lang leer war. Der Unterschied
                zwischen "nichts gemessen" und "null gemessen" ist hier der
                ganze Unterschied. */}
            {daten[0].t - tMin > tSpanne * 0.04 && (
              <g>
                <rect
                  x={RAND.links}
                  y={RAND.oben}
                  width={Math.max(0, x(daten[0].t) - RAND.links)}
                  height={plotHoehe}
                  fill="var(--flaeche-2)"
                  opacity="0.75"
                />
                {x(daten[0].t) - RAND.links > 150 && (
                  <text
                    x={(RAND.links + x(daten[0].t)) / 2}
                    y={RAND.oben + plotHoehe / 2}
                    textAnchor="middle"
                    fontSize="11"
                    fill="var(--ink-3)"
                  >
                    keine Messwerte vor {zeitFormat.format(new Date(daten[0].t))}
                  </text>
                )}
              </g>
            )}

            {/* Gitter: durchgezogene Haarlinien, zuruecktretend */}
            {raster.ticks.map((wert) => (
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
                  {zahlText(wert)}
                </text>
              </g>
            ))}

            {/* Schwellwert - hier ist die Strichelung inhaltlich richtig */}
            {schwelle && schwelle.wert >= raster.unten && schwelle.wert <= raster.oben && (
              <>
                <line
                  x1={RAND.links}
                  x2={breite - RAND.rechts}
                  y1={y(schwelle.wert)}
                  y2={y(schwelle.wert)}
                  stroke="var(--kritisch)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                {/* Links, nicht rechts: rechts sitzt immer der hervorgehobene
                    Endpunkt, und genau wenn der Messwert an der Schwelle
                    steht, deckt er die Beschriftung zu. Der helle Saum um die
                    Schrift haelt sie ausserdem dort lesbar, wo die Kurve
                    selbst durch die Schwelle laeuft. */}
                <text
                  x={RAND.links + 4}
                  y={y(schwelle.wert) - 5}
                  textAnchor="start"
                  fontSize="10"
                  fill="var(--ink-3)"
                  stroke="var(--flaeche)"
                  strokeWidth="3"
                  paintOrder="stroke"
                  strokeLinejoin="round"
                >
                  {schwelle.text}
                </text>
              </>
            )}

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

            {/* Fläche als leiser Hauch, dann die Linie - je Abschnitt */}
            {pfade.map((p) => p.flaeche && <path key={`f${p.schluessel}`} d={p.flaeche} fill={wash} />)}
            {pfade.map((p) => (
              <path
                key={`l${p.schluessel}`}
                d={p.linie}
                fill="none"
                stroke={farbe}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}

            {/* Endpunkt hervorheben */}
            <circle
              cx={x(letzter.t)}
              cy={y(letzter.y)}
              r="4"
              fill={farbe}
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
                  fill={farbe}
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
              <div className="zahl mt-0.5 text-sm font-semibold text-ink">
                {zahlText(aktiverPunkt.y)} {einheit}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
