"use client";

import { useState } from "react";
import type { Sensoreinstellungen } from "@/lib/sensoreinstellungen";

/**
 * Die Werte fuer die NFC-App, zum Abhaken und Antippen.
 *
 * Das Passwort steht zunaechst verdeckt: die Seite wird oft am Container
 * aufgemacht, mit Publikum. Kopieren geht auch verdeckt - abschreiben will
 * man 48 Zeichen ohnehin nicht.
 */
export function Nfceinstellungen({ daten }: { daten: Sensoreinstellungen }) {
  const [gezeigt, setGezeigt] = useState(false);
  const [kopiert, setKopiert] = useState<string | null>(null);

  async function kopieren(feld: string, wert: string) {
    try {
      await navigator.clipboard.writeText(wert);
      setKopiert(feld);
      setTimeout(() => setKopiert(null), 2000);
    } catch {
      // Ohne Zwischenablage (aelterer Browser, kein HTTPS) bleibt das
      // Markieren von Hand - der Wert steht ja da.
    }
  }

  if (daten.fehlt) {
    return (
      <div className="karte-flaeche p-4">
        <p className="text-sm font-medium">Einstellungen für die NFC-App</p>
        <p className="mt-1 text-sm" style={{ color: "var(--ernst)" }}>
          {daten.fehlt}
        </p>
      </div>
    );
  }

  return (
    <div className="karte-flaeche p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Einstellungen für die NFC-App</h2>
        <button
          type="button"
          onClick={() => setGezeigt((v) => !v)}
          className="text-xs underline underline-offset-2"
        >
          {gezeigt ? "Passwort verbergen" : "Passwort anzeigen"}
        </button>
      </div>

      <p className="mt-1 text-xs text-ink-2">
        Milesight ToolBox öffnen, Handy an das Gehäuse halten, dann{" "}
        <span className="font-medium">Device → Application Mode</span>. Die Reihenfolge hier folgt
        der App; die Menüpunkte heißen je nach Firmwarestand etwas anders – maßgeblich sind die
        Werte. Zum Schluss <span className="font-medium">Write</span> drücken.
      </p>

      <dl className="mt-3 divide-y text-sm">
        {daten.einstellungen.map((e) => {
          const verdeckt = e.geheim && !gezeigt;
          return (
            <div key={e.feld} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <dt className="w-full text-xs text-ink-3 sm:w-52 sm:shrink-0">{e.feld}</dt>
              <dd className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                {e.datei ? (
                  <a
                    href={e.datei}
                    download
                    className="zahl break-all font-medium underline underline-offset-2"
                  >
                    {e.wert} ↓
                  </a>
                ) : (
                  <span className={`zahl break-all font-medium ${verdeckt ? "select-none" : ""}`}>
                    {verdeckt ? "•".repeat(24) : e.wert}
                  </span>
                )}
                {e.kopierbar && (
                  <button
                    type="button"
                    onClick={() => kopieren(e.feld, e.wert)}
                    className="text-xs underline underline-offset-2 text-ink-3 hover:text-ink"
                  >
                    {kopiert === e.feld ? "kopiert" : "kopieren"}
                  </button>
                )}
                {e.hinweis && <span className="w-full text-xs text-ink-3">{e.hinweis}</span>}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
