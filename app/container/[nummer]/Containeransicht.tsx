"use client";

import { useEffect, useMemo, useState } from "react";
import { Kartenansicht } from "@/components/Kartenansicht";
import { browserClient } from "@/lib/supabase/client";
import { STUFEN, alterText, stufeVon } from "@/lib/fuellstand";
import { entfernungKm } from "@/lib/route";
import type { OeffentlicherContainer, OeffentlicherStandort } from "@/lib/typen";

type Ortung = "laeuft" | "da" | "abgelehnt" | "unmoeglich";

/** "800 m" bzw. "2,4 km" – auf dem Handy die einzige Zahl, die zählt. */
function entfernungText(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`;
}

function anschrift(p: { strasse: string | null; plz: string | null; ort: string | null }): string {
  return [p.strasse, [p.plz, p.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Die Seite hinter dem QR-Code am Container.
 *
 * Wer hier landet, steht mit einer Tüte vor einem vollen Container. Die
 * einzige Frage, die zählt, ist: **wo kann ich sie loswerden?** Deshalb steht
 * die Antwort oben, einzeln und groß, mit Entfernung und Routenknopf – nicht
 * als Zeile in einer Liste, die man erst lesen muss.
 *
 * **Der Standort wird beim Laden abgefragt, nicht auf Knopfdruck.** Vorher
 * musste man erst „Meinen Standort verwenden" drücken; bis dahin war die
 * Reihenfolge nach dem gescannten Container sortiert und damit meistens
 * falsch, ohne dass es jemand merkte. Ein Handgriff, den ohnehin jeder machen
 * muss, gehört nicht auf einen Knopf.
 *
 * **Gezählt wird in Plätzen, nicht in Containern.** Für den Bürger ist ein
 * Parkplatz mit drei Containern eine Antwort, nicht drei. Ein Platz taugt,
 * solange dort mindestens ein Container noch aufnimmt.
 *
 * **Die Position verlässt das Gerät nicht.** Die Platzliste kommt ohnehin
 * vollständig vom Server; sortiert wird hier. Es gibt keinen Endpunkt, an den
 * Koordinaten gingen, und nichts, was sie speichern könnte. Ohne Freigabe wird
 * nach Entfernung zum gescannten Container sortiert – der ist ja bekannt.
 */
export function Containeransicht({
  dieser,
  plaetze,
}: {
  dieser: OeffentlicherContainer | null;
  plaetze: OeffentlicherStandort[];
}) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [ortung, setOrtung] = useState<Ortung>("laeuft");
  const [meldung, setMeldung] = useState<"offen" | "laeuft" | "danke" | "fehler">("offen");

  // Standort sofort anfragen. Der Nutzer sieht währenddessen bereits die
  // Liste, sortiert nach dem gescannten Container - es gibt keinen Zustand,
  // in dem die Seite leer ist und auf eine Erlaubnis wartet.
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setOrtung("unmoeglich");
      return;
    }

    let abgebrochen = false;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (abgebrochen) return;
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude });
        setOrtung("da");
      },
      () => {
        if (abgebrochen) return;
        setOrtung("abgelehnt");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );

    return () => {
      abgebrochen = true;
    };
  }, []);

  // Bezugspunkt: die eigene Position, sonst der gescannte Container.
  const bezug = position ?? (dieser ? { lat: dieser.lat, lng: dieser.lng } : null);

  /** Plätze mit freiem Container, nach Entfernung. Der eigene fällt heraus. */
  const naechste = useMemo(() => {
    if (!bezug) return [];
    return plaetze
      .filter((p) => p.container_mit_platz > 0)
      // Der eigene Platz gehört nicht in die Liste der Alternativen.
      .filter((p) => p.standort_id !== dieser?.standort_id)
      .map((p) => ({ platz: p, km: entfernungKm(bezug, { lat: p.lat, lng: p.lng }) }))
      .sort((a, b) => a.km - b.km);
  }, [plaetze, bezug, dieser]);

  const bester = naechste[0] ?? null;
  const weitere = naechste.slice(1, 5);

  /**
   * Nimmt an DIESEM Platz noch ein anderer Container auf?
   *
   * Dann ist das die richtige Antwort, und keine Adresse zwei Kilometer
   * weiter. Wer vor einem vollen Container steht, sieht den Nachbarcontainer
   * daneben nicht unbedingt als Möglichkeit - er sieht einen vollen Container.
   */
  const hierNochPlatz = dieser?.standort_id
    ? (plaetze.find((p) => p.standort_id === dieser.standort_id) ?? null)
    : null;
  const nebenanFrei =
    hierNochPlatz && hierNochPlatz.container_mit_platz > 0 ? hierNochPlatz : null;

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
    <div className="space-y-5">
      {/* Die Antwort zuerst */}
      <section className="karte-flaeche overflow-hidden">
        <div className="border-b px-5 py-3">
          <h1 className="font-semibold">Hier können Sie abgeben</h1>
          <p className="mt-0.5 text-xs text-ink-3">
            {ortung === "laeuft" && "Ihr Standort wird ermittelt …"}
            {ortung === "da" && "Nach Entfernung zu Ihrem Standort."}
            {ortung === "abgelehnt" && "Ohne Standortfreigabe: Entfernung ab diesem Container."}
            {ortung === "unmoeglich" && "Entfernung ab diesem Container."}
          </p>
        </div>

        {nebenanFrei ? (
          <div className="px-5 py-4">
            <p className="text-xl font-semibold">Hier am Platz ist noch Platz</p>
            <p className="mt-1 text-sm text-ink-2">
              {nebenanFrei.container_mit_platz} von {nebenanFrei.container_gesamt} Containern an
              diesem Standort {nebenanFrei.container_mit_platz === 1 ? "nimmt" : "nehmen"} noch auf –
              Sie müssen nicht weiterfahren.
            </p>
            {bester && (
              <p className="mt-3 border-t pt-3 text-sm text-ink-3">
                Falls hier doch nichts mehr geht: <strong>{bester.platz.name}</strong>,{" "}
                {entfernungText(bester.km)} entfernt.{" "}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${bester.platz.lat},${bester.platz.lng}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-2"
                >
                  Route
                </a>
              </p>
            )}
          </div>
        ) : bester ? (
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xl font-semibold">{bester.platz.name}</span>
              <span className="zahl text-xl font-semibold" style={{ color: "var(--serie)" }}>
                {entfernungText(bester.km)}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">{anschrift(bester.platz)}</p>
            <p className="mt-1 text-sm text-ink-3">
              {bester.platz.container_mit_platz} von {bester.platz.container_gesamt}{" "}
              {bester.platz.container_gesamt === 1 ? "Container nimmt" : "Containern nehmen"} noch
              auf
              {bester.platz.freie_prozent !== null && ` · rund ${bester.platz.freie_prozent} % frei`}
            </p>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${bester.platz.lat},${bester.platz.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="knopf-primaer mt-3 w-full py-3 text-base"
            >
              Route dorthin
            </a>
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-2">
            In der Nähe ist gerade kein Platz mit freier Kapazität bekannt.
          </p>
        )}
      </section>

      {/* Karte: eigene Position und die nächsten Plätze in einem Bild */}
      {naechste.length > 0 && (
        <Kartenansicht
          hoeheKlasse="h-[300px]"
          mitLegende={false}
          eigenePosition={position}
          punkte={naechste.slice(0, 8).map(({ platz }) => ({
            id: platz.standort_id,
            nummer: platz.name,
            bezeichnung: platz.name,
            strasse: platz.strasse,
            plz: platz.plz,
            ort: platz.ort,
            lat: platz.lat,
            lng: platz.lng,
            fuellstand_prozent:
              platz.freie_prozent === null ? null : Math.round(100 - platz.freie_prozent),
            gemessen_am: platz.gemessen_am,
          }))}
        />
      )}

      {/* Weitere Plätze */}
      {weitere.length > 0 && (
        <section className="karte-flaeche overflow-hidden">
          <h2 className="border-b px-5 py-3 font-semibold">Weitere in der Nähe</h2>
          <ul className="divide-y">
            {weitere.map(({ platz, km }) => (
              <li key={platz.standort_id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-full"
                  style={{ background: STUFEN[platz.stufe].farbe }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{platz.name}</div>
                  <div className="text-sm text-ink-2">{anschrift(platz)}</div>
                  <div className="text-xs text-ink-3">
                    {platz.container_mit_platz} von {platz.container_gesamt} frei
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="zahl text-sm font-medium">{entfernungText(km)}</div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${platz.lat},${platz.lng}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs underline underline-offset-2"
                  >
                    Route
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Der gescannte Container - Nebensache, deshalb weiter unten */}
      <section className="karte-flaeche p-5">
        {dieser ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
              Dieser Container
            </p>
            <h2 className="mt-1 font-semibold">{dieser.bezeichnung ?? dieser.nummer}</h2>
            <p className="mt-0.5 text-sm text-ink-2">{anschrift(dieser)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span
                className="inline-block h-4 w-4 rounded-full"
                style={{ background: STUFEN[stufe].farbe }}
                aria-hidden="true"
              />
              <span className="font-semibold">{STUFEN[stufe].text}</span>
              {dieser.fuellstand_prozent !== null && (
                <span className="zahl text-sm text-ink-2">
                  rund {dieser.fuellstand_prozent} % voll
                </span>
              )}
              <span className="text-xs text-ink-3">Messung {alterText(dieser.gemessen_am)}</span>
            </div>

            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-semibold">Ist dieser Container voll?</h3>
              <p className="mt-1 text-sm text-ink-2">
                Dann sagen Sie es uns – wir nehmen ihn in die nächste Planung auf. Gespeichert wird
                ausschließlich, dass dieser Container gemeldet wurde, nicht wer gemeldet hat.
              </p>

              {meldung === "danke" ? (
                <p className="mt-3 rounded-md bg-flaeche-2 p-3 text-sm">
                  <strong>Danke.</strong> Die Meldung liegt der Disposition vor.
                </p>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={alsVollMelden}
                    disabled={meldung === "laeuft"}
                    className="knopf-sekundaer mt-3"
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
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold">Container nicht gefunden</h2>
            <p className="mt-1 text-sm text-ink-2">
              Zu diesem Aufkleber gibt es keinen freigegebenen Container. Die Plätze oben stimmen
              trotzdem.
            </p>
          </>
        )}
      </section>

      <p className="text-xs text-ink-3">
        Die Füllstände sind Messwerte der letzten Übertragung und auf Zehnerschritte gerundet – keine
        Garantie. Ihre Position wird nur auf diesem Gerät verwendet, nirgends gespeichert und nicht
        übertragen.
      </p>
    </div>
  );
}
