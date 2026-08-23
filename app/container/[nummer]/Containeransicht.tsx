"use client";

import { useMemo, useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { STUFEN, alterText, stufeVon } from "@/lib/fuellstand";
import { entfernungKm } from "@/lib/route";
import type { OeffentlicherContainer } from "@/lib/typen";

/**
 * Die Seite hinter dem QR-Code am Container.
 *
 * Zwei Dinge: den nächsten Container mit Platz finden, und melden, dass dieser
 * hier voll ist.
 *
 * **Die Position des Nutzers verlässt das Gerät nicht.** Die öffentliche Liste
 * kommt ohnehin schon vom Server; sortiert wird hier im Browser. Es gibt keinen
 * Endpunkt, an den Koordinaten geschickt würden, und nichts, was sie speichern
 * könnte. Ohne Standortfreigabe wird nach Entfernung zum gescannten Container
 * sortiert – der ist ja bekannt.
 */
export function Containeransicht({
  dieser,
  alle,
}: {
  dieser: OeffentlicherContainer | null;
  alle: OeffentlicherContainer[];
}) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [ortungLaeuft, setOrtungLaeuft] = useState(false);
  const [ortungsfehler, setOrtungsfehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<"offen" | "laeuft" | "danke" | "fehler">("offen");

  // Bezugspunkt: die eigene Position, sonst der gescannte Container.
  const bezug = position ?? (dieser ? { lat: dieser.lat, lng: dieser.lng } : null);

  const freie = useMemo(() => {
    if (!bezug) return [];
    return alle
      .filter((c) => c.id !== dieser?.id)
      .filter((c) => (c.fuellstand_prozent ?? 0) < 90)
      .map((c) => ({ container: c, km: entfernungKm(bezug, { lat: c.lat, lng: c.lng }) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, 5);
  }, [alle, bezug, dieser]);

  function standortHolen() {
    if (!navigator.geolocation) {
      setOrtungsfehler("Dieses Gerät liefert keine Standortdaten.");
      return;
    }
    setOrtungLaeuft(true);
    setOrtungsfehler(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setOrtungLaeuft(false);
      },
      () => {
        setOrtungsfehler("Kein Zugriff auf den Standort. Die Liste zeigt jetzt die Container in der Nähe dieses Standorts.");
        setOrtungLaeuft(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function alsVollMelden() {
    if (!dieser) return;
    setMeldung("laeuft");
    try {
      const { data, error } = await browserClient().rpc("meldung_oeffentlich", {
        p_container_id: dieser.id,
      });
      setMeldung(!error && (data as { ok?: boolean } | null)?.ok ? "danke" : "fehler");
    } catch {
      setMeldung("fehler");
    }
  }

  const stufe = stufeVon(dieser?.fuellstand_prozent);

  return (
    <div className="space-y-6">
      {/* Der gescannte Container */}
      <section className="karte-flaeche p-5">
        {dieser ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              Dieser Container
            </p>
            <h1 className="mt-1 text-xl font-semibold">{dieser.bezeichnung ?? dieser.nummer}</h1>
            <p className="mt-1 text-sm text-ink-2">
              {[dieser.strasse, [dieser.plz, dieser.ort].filter(Boolean).join(" ")]
                .filter(Boolean)
                .join(", ")}
            </p>

            <div className="mt-4 flex items-center gap-3">
              <span
                className="inline-block h-4 w-4 rounded-full"
                style={{ background: STUFEN[stufe].farbe }}
                aria-hidden="true"
              />
              <span className="text-lg font-semibold">{STUFEN[stufe].text}</span>
              {dieser.fuellstand_prozent !== null && (
                <span className="zahl text-ink-2">rund {dieser.fuellstand_prozent} % voll</span>
              )}
            </div>
            <p className="mt-1 text-xs text-ink-3">Letzte Messung {alterText(dieser.gemessen_am)}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Container nicht gefunden</h1>
            <p className="mt-1 text-sm text-ink-2">
              Zu diesem Aufkleber gibt es keinen freigegebenen Container. Unten stehen trotzdem die
              Standorte in der Nähe.
            </p>
          </>
        )}
      </section>

      {/* Voll melden */}
      {dieser && (
        <section className="karte-flaeche p-5">
          <h2 className="font-semibold">Ist dieser Container voll?</h2>
          <p className="mt-1 text-sm text-ink-2">
            Dann sagen Sie es uns. Wir nehmen ihn in die nächste Planung auf. Gespeichert wird
            ausschließlich, dass dieser Container gemeldet wurde – nicht, wer gemeldet hat.
          </p>

          {meldung === "danke" ? (
            <p className="mt-3 rounded-md bg-flaeche-2 p-3 text-sm">
              <strong>Danke.</strong> Die Meldung ist angekommen und liegt der Disposition vor.
            </p>
          ) : (
            <>
              <button
                type="button"
                onClick={alsVollMelden}
                disabled={meldung === "laeuft"}
                className="knopf-primaer mt-3"
              >
                {meldung === "laeuft" ? "Wird gemeldet …" : "Container ist voll"}
              </button>
              {meldung === "fehler" && (
                <p className="mt-2 text-sm" style={{ color: "var(--kritisch)" }}>
                  Das hat gerade nicht geklappt. Bitte später noch einmal versuchen.
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Nächste Container mit Platz */}
      <section className="karte-flaeche p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-semibold">Container mit Platz in der Nähe</h2>
            <p className="mt-1 text-sm text-ink-2">
              {position
                ? "Sortiert nach Entfernung zu Ihrem Standort."
                : "Sortiert nach Entfernung zu diesem Container."}
            </p>
          </div>
          <button
            type="button"
            onClick={standortHolen}
            disabled={ortungLaeuft}
            className="knopf-sekundaer"
          >
            {ortungLaeuft ? "Wird ermittelt …" : position ? "Standort aktualisieren" : "Meinen Standort verwenden"}
          </button>
        </div>

        {ortungsfehler && <p className="mt-2 text-sm text-ink-2">{ortungsfehler}</p>}

        {freie.length === 0 ? (
          <p className="mt-3 text-sm text-ink-2">
            In der Nähe ist gerade kein Container mit freiem Platz bekannt.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {freie.map(({ container, km }) => {
              const s = stufeVon(container.fuellstand_prozent);
              return (
                <li key={container.id} className="flex items-center gap-3 py-3">
                  <span
                    className="inline-block h-3 w-3 shrink-0 rounded-full"
                    style={{ background: STUFEN[s].farbe }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{container.bezeichnung ?? container.nummer}</div>
                    <div className="text-sm text-ink-2">
                      {[container.strasse, container.ort].filter(Boolean).join(", ")}
                    </div>
                    <div className="text-xs text-ink-3">
                      {container.fuellstand_prozent !== null
                        ? `rund ${container.fuellstand_prozent} % voll`
                        : "Füllstand unbekannt"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="zahl text-sm font-medium">
                      {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`}
                    </div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${container.lat},${container.lng}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-xs underline underline-offset-2"
                    >
                      Route
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 border-t pt-3 text-xs text-ink-3">
          Die Füllstände sind Messwerte der letzten Übertragung und auf Zehnerschritte gerundet –
          keine Garantie. Ihre Position wird nur auf diesem Gerät verwendet und nirgends gespeichert.
        </p>
      </section>
    </div>
  );
}
