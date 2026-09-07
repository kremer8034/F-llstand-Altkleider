"use client";

import { useState } from "react";
import { Verlaufskurve } from "./Verlaufskurve";
import { formatDatumZeit } from "@/lib/fuellstand";
import type { Messreihenpunkt } from "@/lib/typen";

/**
 * Fuellstand und Batterie eines Containers als ein Schaubild mit zwei Spuren.
 *
 * Drei Entscheidungen stecken darin, und alle drei folgen daraus, dass die
 * beiden Kurven zusammen gelesen werden ("die Batterie faellt seit der
 * Leerung schneller") und nicht nacheinander:
 *
 *   Eine Zeitachse. Nur die untere Kurve traegt die Datumsangaben. Zweimal
 *   dieselbe Achse untereinander ist doppelte Tinte und trennt optisch, was
 *   zusammengehoert.
 *
 *   Ein Gewicht je Kurve, nicht zwei gleiche. Der Fuellstand ist der Grund,
 *   warum jemand die Seite aufruft - er bekommt Hoehe und Flaeche. Die
 *   Batterie ist eine Nebenauskunft und steht als schlanke Linie darunter.
 *   Zwei gleich satte Flaechen uebereinander sagen dem Auge, beide seien
 *   gleich wichtig, und dann fuehrt keine.
 *
 *   Eine Tabelle fuer beide. Wer die Zahlen sucht, sucht sie zum selben
 *   Zeitpunkt - eine Tabelle mit zwei Spalten beantwortet das, zwei getrennte
 *   Tabellen mit je einem eigenen Umschalter nicht.
 *
 * Die Tabelle traegt seit 0028 auch den gemessenen ABSTAND, und zwar direkt
 * neben dem Fuellstand. Der Fuellstand ist ein Rechenergebnis aus Abstand und
 * Einbauhoehe; steht nur das Ergebnis da, ist bei einem unerwarteten Wert
 * nicht zu erkennen, ob der Sensor etwas anderes gemessen hat als gedacht
 * oder ob die Kalibrierung nicht stimmt. Nebeneinander beantwortet die Zeile
 * das in einem Blick. Eine eigene Kurve bekommt der Abstand nicht - er ist
 * dieselbe Groesse wie der Fuellstand, nur andersherum aufgetragen.
 */
export function Verlaufsbereich({
  reihe,
  leerungen,
  von,
  bis,
  schwelleVoll,
  batterieMinProzent,
  batterieMinVolt,
  zeitraumwahl,
  kopfzeile,
}: {
  reihe: Messreihenpunkt[];
  leerungen: string[];
  von: string;
  bis: string;
  schwelleVoll: number;
  batterieMinProzent: number;
  batterieMinVolt: number;
  /** Die Zeitraumleiste kommt als Serverkomponente von der Seite herein. */
  zeitraumwahl: React.ReactNode;
  kopfzeile: string;
}) {
  const [tabelle, setTabelle] = useState(false);

  // Die Batterie kommt je nach Geraeteart in Prozent oder in Volt: ein
  // Fertiggeraet meldet den Ladestand, der Eigenbau die Zellenspannung
  // (0020_fertiggeraete.sql). Was die Kurve zeigt, entscheidet nicht die
  // Bauart, sondern was im Zeitraum tatsaechlich angekommen ist - sonst
  // stuende bei einem getauschten Sensor eine leere Kurve da.
  const hatProzent = reihe.some((m) => m.batterie_prozent !== null);
  const hatVolt = reihe.some((m) => m.batterie_v !== null);
  const inProzent = hatProzent || !hatVolt;

  const fuellstand = reihe.map((m) => ({ zeit: m.zeit, wert: m.fuellstand_prozent }));
  const batterie = reihe.map((m) => ({
    zeit: m.zeit,
    wert: inProzent ? m.batterie_prozent : m.batterie_v,
  }));

  // Prozent ist von Haus aus eine 0..100er Achse. Volt nicht: eine
  // Lithiumzelle bewegt sich im Betrieb zwischen etwa 3,0 und 3,7 V, und auf
  // einer Achse ab 0 V waere ihr ganzer Verlauf ein Strich am oberen Rand.
  const voltwerte = batterie
    .map((b) => b.wert)
    .filter((w): w is number => w !== null)
    .concat(batterieMinVolt);
  const batterieMin = inProzent ? 0 : Math.floor((Math.min(...voltwerte) - 0.1) * 10) / 10;
  const batterieMax = inProzent
    ? 100
    : Math.max(batterieMin + 0.4, Math.ceil((Math.max(...voltwerte) + 0.1) * 10) / 10);

  const einheit = inProzent ? "%" : "V";
  const nachkomma = inProzent ? 0 : 2;
  const hatWerte = reihe.length > 0;

  // Der Sensor meldet Millimeter, gelesen wird in Metern: 2000 mm ist eine
  // Zahl, die man nachrechnet, "2,00 m" eine, die man sich vorstellt. Immer
  // zwei Nachkommastellen, damit die Spalte eine Zahlenkolonne bleibt und
  // nicht bei jeder Zeile die Kommastelle springt.
  const abstandText = (mm: number | null) =>
    mm === null
      ? "\u2013"
      : `${(mm / 1000).toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} m`;

  return (
    <section className="karte-flaeche p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h2 className="font-semibold">{kopfzeile}</h2>
        <div className="flex flex-wrap items-center gap-4">
          {zeitraumwahl}
          {hatWerte && (
            <button
              type="button"
              onClick={() => setTabelle((t) => !t)}
              className="text-xs font-medium text-ink-3 underline underline-offset-2 hover:text-ink-2"
            >
              {tabelle ? "Kurven anzeigen" : "Als Tabelle"}
            </button>
          )}
        </div>
      </div>

      {tabelle ? (
        <div className="max-h-96 overflow-y-auto rounded-lg border">
          <table className="tabelle">
            <thead className="sticky top-0 bg-flaeche">
              <tr>
                <th>Zeitpunkt</th>
                <th className="text-right">Füllstand</th>
                <th className="text-right">Abstand</th>
                <th className="text-right">Batterie</th>
              </tr>
            </thead>
            <tbody>
              {[...reihe].reverse().map((m) => {
                const batt = inProzent ? m.batterie_prozent : m.batterie_v;
                return (
                  <tr key={m.zeit}>
                    <td className="text-ink-2">{formatDatumZeit(m.zeit)}</td>
                    <td className="zahl text-right font-medium">
                      {m.fuellstand_prozent === null ? "–" : `${m.fuellstand_prozent} %`}
                    </td>
                    <td className="zahl text-right text-ink-2">{abstandText(m.abstand_mm)}</td>
                    <td className="zahl text-right font-medium">
                      {batt === null
                        ? "–"
                        : `${batt.toLocaleString("de-DE", {
                            minimumFractionDigits: nachkomma,
                            maximumFractionDigits: nachkomma,
                          })} ${einheit}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <Verlaufskurve
            punkte={fuellstand}
            leerungen={leerungen}
            schwelle={{ wert: schwelleVoll, text: `voll ab ${schwelleVoll} %` }}
            ueberschrift="Füllstand"
            von={von}
            bis={bis}
            zeitachse={false}
            eigeneTabelle={false}
          />

          <div className="mt-5">
            <Verlaufskurve
              punkte={batterie}
              schwelle={
                inProzent
                  ? { wert: batterieMinProzent, text: `schwach ab ${batterieMinProzent} %` }
                  : {
                      wert: batterieMinVolt,
                      text: `schwach ab ${batterieMinVolt.toLocaleString("de-DE")} V`,
                    }
              }
              ueberschrift="Batterie"
              einheit={einheit}
              yMin={batterieMin}
              yMax={batterieMax}
              nachkommastellen={nachkomma}
              farbe="var(--serie-2)"
              wash="var(--serie-2-wash)"
              flaeche={false}
              hoehe={150}
              von={von}
              bis={bis}
              eigeneTabelle={false}
              leerText="In diesem Zeitraum hat der Sensor keinen Batteriewert gemeldet."
            />
          </div>

          {hatWerte && (
            <p className="mt-3 text-xs leading-relaxed text-ink-3">
              Grüne Punkte auf der Grundlinie markieren erkannte Leerungen. Unterschreitet die
              Batterie die gestrichelte Linie, löst die Anlage den Alarm „Batterie schwach“ aus.
            </p>
          )}
        </>
      )}
    </section>
  );
}
