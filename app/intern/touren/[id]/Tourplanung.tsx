"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Mehrfachauswahl } from "@/components/Mehrfachauswahl";
import { adresse } from "@/lib/fuellstand";
import {
  euroText,
  kennzahlText,
  stoppKosten,
  tourdurchschnitt,
  type Kostensaetze,
  type Stoppkosten,
} from "@/lib/kosten";
import { entfernungKm, kartenAbschnitte, routePlanen, umwegKm, type Ort } from "@/lib/route";
import type { Stoppstatus, Tour, TourFortschritt } from "@/lib/typen";
import { GRUND_TEXT, TOURSTATUS_TEXT } from "../planungstypen";
import {
  reihenfolgeNeuBerechnen,
  stoppEntfernen,
  stoppVerschieben,
  stoppsHinzufuegen,
  tourAendern,
  tourBeenden,
  tourLoeschen,
} from "../aktionen";

export interface Stoppcontainer {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  fuellstand_prozent: number | null;
  /** null = auf dieser Tour noch nicht erfasst. */
  geleert: boolean | null;
  grund: string | null;
}

export interface Stoppzeile {
  stopp_id: string;
  standort_id: string;
  position: number;
  status: Stoppstatus;
  erledigt_am: string | null;
  notiz: string | null;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  zufahrt: string | null;
  lat: number | null;
  lng: number | null;
  freie_prozent: number | null;
  /** Ertrag in Containerfüllungen: drei Container zu 80 % sind 2,4 (0022). */
  ertrag_fuellungen: number | null;
  container_gesamt: number;
  grund: string | null;
  abholung_vereinbart: boolean;
  entsorger_name: string | null;
  container: Stoppcontainer[];
}

const KM = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
/** Containerfüllungen: eine Nachkommastelle, "2,4 Füllungen" liest sich rund. */
const F = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const UHR = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * Eine Tour planen und ihren Verlauf verfolgen.
 *
 * Der Unterschied zur alten Seite: was hier steht, ist gespeichert. Die
 * Reihenfolge, die die Disposition sieht, ist dieselbe, die der Fahrer in
 * seiner Ansicht bekommt – vorher lebte beides im Browser und war beim
 * Neuladen weg.
 *
 * Auswahl und Reihenfolge bleiben getrennt: welche Stopps mitkommen,
 * entscheiden Restkapazität und Deckung; die Reihenfolge entscheidet die
 * Fahrtstrecke. Den vollsten zuerst zu nehmen kostet nur Umwege.
 */
export function Tourplanung({
  tour,
  fortschritt,
  zeilen,
  kandidaten,
  fahrer,
  gruppen,
  betriebshof,
  saetze,
  bearbeiten,
}: {
  tour: Tour;
  fortschritt: TourFortschritt | null;
  zeilen: Stoppzeile[];
  kandidaten: {
    id: string;
    name: string;
    ort: string | null;
    hinweis: string | null;
    pflicht: boolean;
    fuellstand_prozent: number | null;
    ertrag_fuellungen: number | null;
    container_gesamt: number;
  }[];
  fahrer: { id: string; name: string; rolle: string }[];
  gruppen: { id: string; name: string }[];
  betriebshof: (Ort & { name?: string }) | null;
  saetze: Kostensaetze;
  bearbeiten: boolean;
}) {
  const [rundfahrt, setRundfahrt] = useState(true);
  const [abStart, setAbStart] = useState(betriebshof !== null);

  /**
   * Die Kopfdaten der Tour stehen in gesteuerten Feldern, nicht in
   * `defaultValue`.
   *
   * Das war die Ursache eines handfesten Fehlers: React setzt ein Formular
   * nach einer Server-Aktion zurück (`requestFormReset`). Ein Zurücksetzen
   * bringt jedes Feld auf seinen Zustand im HTML - bei einer Auswahlliste
   * also auf die Option mit dem `selected`-Merkmal. Das ist die, die beim
   * Aufbau der Seite gesetzt war, nämlich „niemand". Der neu ausgewählte
   * Fahrer wurde zwar gespeichert, die Anzeige sprang danach aber sichtbar
   * zurück - und wer daraufhin ein zweites Mal auf „Übernehmen" drückte,
   * schickte den zurückgesetzten, leeren Wert ab und löschte damit die
   * Zuweisung, die eben noch richtig gespeichert war.
   *
   * Mit gesteuerten Feldern gibt es diesen Zustand nicht: was angezeigt
   * wird, steht in React, und der Abgleich mit dem Server läuft über den
   * useEffect darunter. Angezeigt ist damit immer das, was gespeichert ist.
   */
  const [name, setName] = useState(tour.name ?? "");
  const [datum, setDatum] = useState(tour.datum);
  const [fahrerId, setFahrerId] = useState(tour.fahrer_id ?? "");
  const [gruppeId, setGruppeId] = useState(tour.gruppe_id ?? "");
  const [bemerkung, setBemerkung] = useState(tour.bemerkung ?? "");

  // Nach dem Speichern kommt die Seite mit den neuen Werten zurück; von da an
  // gelten sie. Ohne diesen Abgleich bliebe die Anzeige auf dem Stand des
  // ersten Aufbaus stehen.
  useEffect(() => {
    setName(tour.name ?? "");
    setDatum(tour.datum);
    setFahrerId(tour.fahrer_id ?? "");
    setGruppeId(tour.gruppe_id ?? "");
    setBemerkung(tour.bemerkung ?? "");
  }, [tour.name, tour.datum, tour.fahrer_id, tour.gruppe_id, tour.bemerkung]);

  const geaendert =
    name !== (tour.name ?? "") ||
    datum !== tour.datum ||
    fahrerId !== (tour.fahrer_id ?? "") ||
    gruppeId !== (tour.gruppe_id ?? "") ||
    bemerkung !== (tour.bemerkung ?? "");

  const laeuft = tour.status === "laeuft";
  const beendet = tour.status === "abgeschlossen" || tour.status === "abgebrochen";
  const planbar = bearbeiten && !beendet;

  const start: Ort | null = abStart ? betriebshof : null;

  const mitOrt = useMemo(
    () => zeilen.filter((z) => z.lat !== null && z.lng !== null),
    [zeilen],
  );
  const ohneOrt = zeilen.filter((z) => z.lat === null || z.lng === null);

  /** Strecke in der gespeicherten Reihenfolge – nicht in einer optimierten. */
  const strecke = useMemo(() => {
    if (mitOrt.length < 1) return null;
    const punkte = mitOrt.map((z) => ({ lat: z.lat as number, lng: z.lng as number }));
    const folge = start ? [start, ...punkte] : punkte;

    let summe = 0;
    const etappen: number[] = [];
    for (let i = 1; i < folge.length; i++) {
      const d = entfernungKm(folge[i - 1], folge[i]);
      etappen.push(d);
      summe += d;
    }
    if (rundfahrt && start && punkte.length > 0) {
      summe += entfernungKm(punkte[punkte.length - 1], start);
    }
    return { summe, etappen: start ? etappen : [0, ...etappen] };
  }, [mitOrt, start, rundfahrt]);

  /** Was die gespeicherte Reihenfolge gegenüber der kürzesten kostet. */
  const kuerzeste = useMemo(() => {
    if (mitOrt.length < 3) return null;
    const geplant = routePlanen(
      mitOrt.map((z) => ({ lat: z.lat as number, lng: z.lng as number })),
      start,
      rundfahrt,
    );
    return geplant.strecke;
  }, [mitOrt, start, rundfahrt]);

  const kosten = useMemo(() => {
    const folge = mitOrt.map((z) => ({ lat: z.lat as number, lng: z.lng as number }));
    const karte = new Map<string, Stoppkosten>();

    mitOrt.forEach((z, i) => {
      const ohneIhn = folge.filter((_, j) => j !== i);
      karte.set(
        z.stopp_id,
        stoppKosten(
          {
            umwegKm: umwegKm(ohneIhn, start, { lat: z.lat as number, lng: z.lng as number }, rundfahrt),
            containerAnzahl: z.container_gesamt,
            ertragFuellungen: Number(z.ertrag_fuellungen ?? 0),
          },
          saetze,
        ),
      );
    });
    return karte;
  }, [mitOrt, start, rundfahrt, saetze]);

  const schnitt = useMemo(() => tourdurchschnitt([...kosten.values()]), [kosten]);

  const offeneZiele = zeilen.filter((z) => z.status === "offen" && z.lat !== null && z.lng !== null);
  const kartenLinks = kartenAbschnitte(
    offeneZiele.map((z) => ({ lat: z.lat as number, lng: z.lng as number })),
    start,
  );

  const ertragGesamt = zeilen.reduce((s, z) => s + Number(z.ertrag_fuellungen ?? 0), 0);
  const pflichtOffen = kandidaten.filter((k) => k.pflicht).length;

  return (
    <div className="space-y-4">
      {/* Kopf: wer fährt, wann, wie weit ist es */}
      <div className="karte-flaeche p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{tour.name ?? "Tour ohne Namen"}</h1>
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  laeuft ? "text-white" : "bg-flaeche-2 text-ink-2"
                }`}
                style={laeuft ? { background: "var(--serie)" } : undefined}
              >
                {TOURSTATUS_TEXT[tour.status] ?? tour.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-2">
              {new Intl.DateTimeFormat("de-DE", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              }).format(new Date(`${tour.datum}T12:00:00`))}
              {tour.begonnen_am && ` · begonnen ${UHR.format(new Date(tour.begonnen_am))} Uhr`}
              {tour.abgeschlossen_am &&
                ` · beendet ${UHR.format(new Date(tour.abgeschlossen_am))} Uhr`}
            </p>
            {fortschritt && (
              <p className="mt-1 text-sm text-ink-3">
                {fortschritt.stopps_erledigt} von {fortschritt.stopps_gesamt} Stopps erledigt
                {fortschritt.container_geleert > 0 &&
                  ` · ${fortschritt.container_geleert} Container geleert`}
                {fortschritt.container_stehen_geblieben > 0 &&
                  ` · ${fortschritt.container_stehen_geblieben} stehen geblieben`}
              </p>
            )}
          </div>

          {strecke && (
            <div className="text-right text-sm">
              <div className="zahl text-lg font-semibold">{KM.format(strecke.summe)} km</div>
              {kuerzeste !== null && strecke.summe > kuerzeste + 0.5 && (
                <div className="text-xs" style={{ color: "var(--ernst)" }}>
                  kürzeste Folge: {KM.format(kuerzeste)} km
                </div>
              )}
              {schnitt !== null && (
                <div className="text-xs text-ink-3">Schnitt {kennzahlText(schnitt)}</div>
              )}
              {ertragGesamt > 0 && (
                <div className="text-xs text-ink-3">{F.format(ertragGesamt)} Füllungen zu holen</div>
              )}
            </div>
          )}
        </div>

        {/* Fahrer, Name, Tag, Bereitschaft */}
        {bearbeiten && (
          <form action={tourAendern} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-4">
            <input type="hidden" name="id" value={tour.id} />
            <div className="sm:col-span-2">
              <label htmlFor="name" className="mb-1 block text-xs font-medium text-ink-2">
                Bezeichnung
              </label>
              <input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="feld"
              />
            </div>
            <div>
              <label htmlFor="datum" className="mb-1 block text-xs font-medium text-ink-2">
                Tag
              </label>
              <input
                id="datum"
                name="datum"
                type="date"
                value={datum}
                onChange={(e) => setDatum(e.target.value)}
                className="feld zahl"
              />
            </div>
            <div>
              <label htmlFor="fahrer_id" className="mb-1 block text-xs font-medium text-ink-2">
                Fahrer
              </label>
              <select
                id="fahrer_id"
                name="fahrer_id"
                value={fahrerId}
                onChange={(e) => setFahrerId(e.target.value)}
                className="feld"
              >
                <option value="">– niemand –</option>
                {fahrer.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.rolle !== "fahrer" ? ` (${f.rolle})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="gruppe_id" className="mb-1 block text-xs font-medium text-ink-2">
                Bereitschaft
              </label>
              <select
                id="gruppe_id"
                name="gruppe_id"
                value={gruppeId}
                onChange={(e) => setGruppeId(e.target.value)}
                className="feld"
                disabled={gruppen.length === 0}
              >
                <option value="">– keine, gemeinsame Tour –</option>
                {gruppen.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-3">
                {gruppen.length === 0
                  ? "Noch keine Bereitschaft angelegt."
                  : "Entscheidet, welche Disposition diese Tour sieht und ändern darf."}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bemerkung" className="mb-1 block text-xs font-medium text-ink-2">
                Hinweis für das Fahrpersonal
              </label>
              <input
                id="bemerkung"
                name="bemerkung"
                value={bemerkung}
                onChange={(e) => setBemerkung(e.target.value)}
                className="feld"
                placeholder="z. B. Schlüssel für Poller liegt im Fahrzeug"
              />
            </div>
            <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
              <button type="submit" className={geaendert ? "knopf-primaer" : "knopf-sekundaer"}>
                Übernehmen
              </button>
              {geaendert && (
                <span className="text-xs text-ink-2">Noch nicht gespeichert.</span>
              )}
              {!geaendert && !tour.fahrer_id && (
                <span className="text-xs" style={{ color: "var(--ernst)" }}>
                  Ohne Fahrer erscheint die Tour in keiner Fahreransicht.
                </span>
              )}
              {!geaendert && tour.fahrer_id && (
                <span className="text-xs text-ink-3">
                  Zugewiesen an{" "}
                  {fahrer.find((f) => f.id === tour.fahrer_id)?.name ?? "unbekanntes Konto"}.
                </span>
              )}
            </div>
          </form>
        )}
      </div>

      {/* Steuerung der Streckenrechnung */}
      {zeilen.length > 1 && (
        <div className="karte-flaeche flex flex-wrap items-center gap-3 p-3 text-sm">
          {betriebshof && (
            <label className="inline-flex items-center gap-2 text-ink-2">
              <input
                type="checkbox"
                checked={abStart}
                onChange={(e) => setAbStart(e.target.checked)}
              />
              ab {betriebshof.name ?? "Betriebshof"}
            </label>
          )}
          <label className="inline-flex items-center gap-2 text-ink-2">
            <input
              type="checkbox"
              checked={rundfahrt}
              onChange={(e) => setRundfahrt(e.target.checked)}
            />
            Rückweg zum Start
          </label>

          {planbar && (
            <form action={reihenfolgeNeuBerechnen}>
              <input type="hidden" name="tour_id" value={tour.id} />
              <button type="submit" className="knopf-sekundaer px-3 py-1.5 text-sm">
                Reihenfolge nach kürzester Strecke
              </button>
            </form>
          )}

          {kartenLinks.length > 0 && (
            <div className="ml-auto flex flex-wrap gap-2">
              {kartenLinks.map((link, i) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="knopf-sekundaer px-3 py-1.5 text-sm"
                >
                  {kartenLinks.length === 1 ? "Im Navi öffnen" : `Abschnitt ${i + 1}`}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Die Stopps */}
      <div className="karte-flaeche divide-y overflow-hidden">
        {zeilen.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-3">
            Auf dieser Tour steht noch kein Stopp. Unten aufnehmen.
          </p>
        )}

        {zeilen.map((z, index) => {
          const k = kosten.get(z.stopp_id);
          const fertig = z.status !== "offen";
          const etappe = strecke?.etappen[mitOrt.findIndex((m) => m.stopp_id === z.stopp_id)];

          return (
            <div key={z.stopp_id} className={`px-4 py-3 ${fertig ? "bg-flaeche-2/40" : ""}`}>
              <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                <span
                  className={`zahl mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    fertig ? "text-white" : "bg-flaeche-2 text-ink-2"
                  }`}
                  style={fertig ? { background: "var(--gut)" } : undefined}
                >
                  {fertig ? "✓" : index + 1}
                </span>

                <div className="min-w-[200px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/intern/standorte/${z.standort_id}`}
                      className={`font-medium ${fertig ? "line-through" : ""}`}
                    >
                      {z.name}
                    </Link>
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                      {z.container_gesamt} Container
                    </span>
                    {z.status === "uebersprungen" && (
                      <span className="rounded border px-1.5 py-0.5 text-xs text-ink-2">
                        übersprungen
                      </span>
                    )}
                    {!z.abholung_vereinbart && (
                      <span className="text-xs text-ink-3">Müll mitnehmen</span>
                    )}
                    {z.abholung_vereinbart && z.entsorger_name && (
                      <span className="text-xs text-ink-3">Bauhof: {z.entsorger_name}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-2">{adresse(z)}</div>
                  {z.zufahrt && <div className="mt-0.5 text-xs text-ink-3">{z.zufahrt}</div>}
                  {z.grund && !fertig && (
                    <div className="mt-0.5 text-xs text-ink-3">
                      {GRUND_TEXT[z.grund as keyof typeof GRUND_TEXT] ?? z.grund}
                    </div>
                  )}
                  {z.notiz && (
                    <div className="mt-1 rounded bg-flaeche-2 px-2 py-1 text-xs text-ink-2">
                      Notiz vom Fahrpersonal: {z.notiz}
                    </div>
                  )}

                  {/* Was hier steht und was daraus wurde */}
                  {z.container.length > 0 && (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                      {z.container.map((c) => (
                        <li
                          key={c.id}
                          className="rounded border px-1.5 py-0.5"
                          style={
                            c.geleert === false
                              ? { borderColor: "var(--ernst)", color: "var(--ernst)" }
                              : undefined
                          }
                          title={c.grund ?? undefined}
                        >
                          <span className="zahl">{c.nummer}</span>
                          {c.geleert === true && " ✓"}
                          {c.geleert === false && " · stehen geblieben"}
                          {c.geleert === null && c.fuellstand_prozent !== null && (
                            <span className="zahl text-ink-3"> {c.fuellstand_prozent} %</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="w-full max-w-[180px]">
                  <Fuellstandsbalken
                    prozent={z.freie_prozent === null ? null : Math.round(100 - z.freie_prozent)}
                  />
                  <div className="mt-1 text-xs text-ink-3">
                    {z.ertrag_fuellungen !== null && `${F.format(z.ertrag_fuellungen)} Füllungen`}
                    {etappe !== undefined && etappe > 0 && ` · ${KM.format(etappe)} km`}
                    {z.erledigt_am && ` · ${UHR.format(new Date(z.erledigt_am))} Uhr`}
                  </div>
                </div>

                <div className="w-full text-xs sm:w-32 sm:text-right">
                  {k && (
                    <>
                      <div className="text-ink-2">{kennzahlText(k.euroJeFuellung)}</div>
                      <div className="text-ink-3">{euroText(k.kosten)}</div>
                    </>
                  )}
                </div>

                {planbar && !fertig && (
                  <div className="flex shrink-0 gap-1">
                    <form action={stoppVerschieben}>
                      <input type="hidden" name="tour_id" value={tour.id} />
                      <input type="hidden" name="stopp_id" value={z.stopp_id} />
                      <input type="hidden" name="richtung" value="hoch" />
                      <button
                        type="submit"
                        disabled={index === 0}
                        className="knopf-sekundaer px-2 py-1 text-xs disabled:opacity-30"
                        aria-label="nach oben"
                      >
                        ↑
                      </button>
                    </form>
                    <form action={stoppVerschieben}>
                      <input type="hidden" name="tour_id" value={tour.id} />
                      <input type="hidden" name="stopp_id" value={z.stopp_id} />
                      <input type="hidden" name="richtung" value="runter" />
                      <button
                        type="submit"
                        disabled={index === zeilen.length - 1}
                        className="knopf-sekundaer px-2 py-1 text-xs disabled:opacity-30"
                        aria-label="nach unten"
                      >
                        ↓
                      </button>
                    </form>
                    <form action={stoppEntfernen}>
                      <input type="hidden" name="tour_id" value={tour.id} />
                      <input type="hidden" name="stopp_id" value={z.stopp_id} />
                      <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
                        ✕
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {ohneOrt.length > 0 && (
          <p className="px-4 py-2 text-xs text-ink-3">
            {ohneOrt.length} Stopp{ohneOrt.length > 1 ? "s" : ""} ohne Koordinaten – nicht in der
            Streckenrechnung enthalten.
          </p>
        )}
      </div>

      {/* Stopps aufnehmen */}
      {planbar && kandidaten.length > 0 && (
        <section className="karte-flaeche p-4">
          <h2 className="font-semibold">Stopps aufnehmen</h2>
          <p className="mt-1 text-sm text-ink-2">
            Fällige Standorte stehen oben, mit Füllstand und Grund daneben. Neue Stopps kommen ans
            Ende – danach die Reihenfolge neu rechnen lassen.
          </p>
          {pflichtOffen > 0 && (
            <p className="mt-1 text-sm" style={{ color: "var(--ernst)" }}>
              {pflichtOffen} {pflichtOffen === 1 ? "Standort muss" : "Standorte müssen"} heute noch
              mit und {pflichtOffen === 1 ? "steht" : "stehen"} auf keiner Tour.
            </p>
          )}
          <form action={stoppsHinzufuegen} className="mt-3 space-y-3">
            <input type="hidden" name="tour_id" value={tour.id} />
            <Mehrfachauswahl
              name="standort_id"
              beschriftung="Standorte"
              eintraege={kandidaten.map((k) => ({
                id: k.id,
                titel: k.name,
                unterzeile: [
                  k.ort,
                  `${k.container_gesamt} Container`,
                  k.ertrag_fuellungen ? `${F.format(k.ertrag_fuellungen)} Füllungen zu holen` : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
                hinweis: k.hinweis,
                fuellstand_prozent: k.fuellstand_prozent,
                dringend: k.pflicht,
                suchtext: [k.hinweis, k.pflicht ? "pflicht muss mit" : null]
                  .filter(Boolean)
                  .join(" "),
              }))}
            />
            <button type="submit" className="knopf-primaer">
              Aufnehmen
            </button>
          </form>
        </section>
      )}

      {/* Abschluss und Löschen */}
      {bearbeiten && (
        <div className="grid gap-4 sm:grid-cols-2">
          {!beendet && (
            <form action={tourBeenden} className="karte-flaeche p-4">
              <input type="hidden" name="id" value={tour.id} />
              <h2 className="font-semibold">Tour beenden</h2>
              <p className="mt-1 text-sm text-ink-2">
                Normalerweise schließt das Fahrpersonal die Tour selbst ab. Hier geht es auch von
                der Disposition aus – etwa, wenn die Fahrt wegen Panne oder Wetter abgebrochen
                wurde.
              </p>
              <label className="mt-2 inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name="abgebrochen" />
                als abgebrochen kennzeichnen
              </label>
              <input
                name="bemerkung"
                className="feld mt-2"
                placeholder="Grund, falls abgebrochen"
              />
              <button type="submit" className="knopf-sekundaer mt-3">
                Beenden
              </button>
            </form>
          )}

          <form action={tourLoeschen} className="karte-flaeche p-4">
            <input type="hidden" name="id" value={tour.id} />
            <h2 className="font-semibold">Tour löschen</h2>
            <p className="mt-1 text-sm text-ink-2">
              Die Stopps verschwinden mit. Bereits erfasste Leerungen bleiben erhalten – sie sind
              geschehen, unabhängig davon, unter welchem Auftrag sie erfasst wurden.
            </p>
            <button type="submit" className="knopf-sekundaer mt-3">
              Löschen
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
