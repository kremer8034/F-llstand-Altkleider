"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Entsorgerhinweis } from "@/components/Entsorgerhinweis";
import { browserClient } from "@/lib/supabase/client";
import { abarbeiten, einreihen, tourAblegen, tourHolen, warteschlange, type Auftrag } from "@/lib/offline";
import type { StandortEntsorgung, Stoppstatus, Tour } from "@/lib/typen";

export interface Fahrcontainer {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  fuellstand_prozent: number | null;
  /** null = auf dieser Tour noch nicht erfasst. */
  geleert: boolean | null;
  grund: string | null;
}

export interface Fahrstopp {
  stopp_id: string;
  standort_id: string;
  position: number;
  status: Stoppstatus;
  notiz: string | null;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  zufahrt: string | null;
  bemerkung: string | null;
  lat: number | null;
  lng: number | null;
  entsorgung: StandortEntsorgung | null;
  container: Fahrcontainer[];
}

/** Was der Fahrer je Container festhält, bevor er den Stopp abschließt. */
type Erfassung = Record<string, { geleert: boolean; grund: string }>;

const GRUENDE = [
  "Fremdmüll im Container",
  "Container zugeparkt",
  "Container beschädigt",
  "Klappe verklemmt",
  "Nicht erreichbar",
];

function anschrift(s: Fahrstopp): string {
  return [s.strasse, [s.plz, s.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

/**
 * Die Tour abfahren – ein Schritt je Bildschirm.
 *
 * Der Ablauf bildet ab, was tatsächlich passiert: einsteigen, losfahren,
 * ankommen, leeren, weiterfahren. Auf jedem Bildschirm steht genau eine
 * Frage, und der nächste Schritt ist der größte Knopf. Eine Liste aller
 * Stopps mit Kästchen zum Abhaken wäre für die Disposition richtig und für
 * jemanden am Container falsch: der will nicht suchen, wo er gerade ist.
 *
 *   Übersicht  →  Fahren  →  Vor Ort  →  Fahren  →  …  →  Fertig
 *
 * **Offline.** Jede Bestätigung geht zuerst in die Warteschlange
 * (lib/offline.ts) und gilt der Oberfläche damit sofort. Gesendet wird
 * danach; misslingt es, bleibt der Auftrag stehen und wird beim nächsten Netz
 * erneut versucht. Dass daraus keine doppelten Leerungen werden, sichert die
 * Datenbank: tour_stopp_abschliessen() ist wiederholbar.
 */
export function Tourablauf({
  tour,
  stopps,
  darfFahren,
  darfPlanen,
}: {
  tour: Tour;
  stopps: Fahrstopp[];
  darfFahren: boolean;
  darfPlanen: boolean;
}) {
  const router = useRouter();

  // Beim ersten Laden mit Netz ablegen; ohne Netz das Abgelegte nehmen.
  const [daten] = useState<{ tour: Tour; stopps: Fahrstopp[] }>(() => {
    if (stopps.length > 0) return { tour, stopps };
    const gemerkt = tourHolen<{ tour: Tour; stopps: Fahrstopp[] }>(tour.id);
    return gemerkt ?? { tour, stopps };
  });

  useEffect(() => {
    if (stopps.length > 0) tourAblegen(tour.id, { tour, stopps });
  }, [tour, stopps]);

  /** Stopps, die die Warteschlange bereits als erledigt führt. */
  const [lokalErledigt, setLokalErledigt] = useState<Set<string>>(new Set());
  const [offen, setOffen] = useState(0);
  const [online, setOnline] = useState(true);
  const [sendet, setSendet] = useState(false);

  const [erfassung, setErfassung] = useState<Erfassung>({});
  const [notiz, setNotiz] = useState("");
  const [vorOrt, setVorOrt] = useState(false);
  const [laeuftGerade, setLaeuftGerade] = useState(false);

  useEffect(() => {
    setLokalErledigt(new Set(warteschlange().map((a) => a.stopp_id)));
    setOffen(warteschlange().length);
    setOnline(navigator.onLine);
  }, []);

  /**
   * Einen Auftrag zur Datenbank bringen.
   *
   * Rückgabe `true` heißt „raus aus der Warteschlange". Das gilt in zwei
   * Fällen: die Buchung ist angekommen, oder sie kann nie mehr ankommen.
   * Letzteres meldet die Funktion als `ok: false` mit Grund - etwa, weil die
   * Tour inzwischen abgeschlossen wurde. Ein solcher Auftrag darf nicht
   * liegen bleiben, sonst versucht die Schlange ihn bis in alle Ewigkeit.
   *
   * Nur ein echter Fehler - kein Netz, Zeitüberschreitung, Serverfehler -
   * lässt den Auftrag stehen.
   */
  const senden = useCallback(async (auftrag: Auftrag): Promise<boolean> => {
    const { error } = await browserClient().rpc("tour_stopp_abschliessen", {
      p_stopp_id: auftrag.stopp_id,
      p_container: auftrag.container,
      p_notiz: auftrag.notiz,
      p_status: auftrag.status,
    });
    return !error;
  }, []);

  const schlangeLeeren = useCallback(async () => {
    if (sendet) return;
    setSendet(true);
    const { offen: rest } = await abarbeiten(senden);
    setOffen(rest);
    setSendet(false);
    if (rest === 0) router.refresh();
  }, [senden, sendet, router]);

  // Sobald wieder Netz da ist: nachsenden.
  useEffect(() => {
    function wiederDa() {
      setOnline(true);
      void schlangeLeeren();
    }
    function weg() {
      setOnline(false);
    }
    window.addEventListener("online", wiederDa);
    window.addEventListener("offline", weg);
    if (navigator.onLine && warteschlange().length > 0) void schlangeLeeren();
    return () => {
      window.removeEventListener("online", wiederDa);
      window.removeEventListener("offline", weg);
    };
  }, [schlangeLeeren]);

  const alleStopps = daten.stopps;
  const erledigt = useCallback(
    (s: Fahrstopp) => s.status !== "offen" || lokalErledigt.has(s.stopp_id),
    [lokalErledigt],
  );

  const naechster = useMemo(() => alleStopps.find((s) => !erledigt(s)) ?? null, [alleStopps, erledigt]);
  const fertigeAnzahl = alleStopps.filter(erledigt).length;
  const gestartet = daten.tour.status === "laeuft";
  const beendet = daten.tour.status === "abgeschlossen" || daten.tour.status === "abgebrochen";

  async function tourStarten() {
    setLaeuftGerade(true);
    const { error } = await browserClient().rpc("tour_starten", { p_tour_id: tour.id });
    setLaeuftGerade(false);
    if (!error) router.refresh();
  }

  async function tourAbschliessen() {
    setLaeuftGerade(true);
    await schlangeLeeren();
    const { error } = await browserClient().rpc("tour_abschliessen", {
      p_tour_id: tour.id,
      p_abgebrochen: false,
      p_bemerkung: null,
    });
    setLaeuftGerade(false);
    if (!error) router.refresh();
  }

  /** Stopp abschließen – erst in die Schlange, dann senden. */
  function stoppAbschliessen(stopp: Fahrstopp, status: "erledigt" | "uebersprungen") {
    const container = stopp.container.map((c) => {
      const e = erfassung[c.id];
      // Ohne Angabe gilt der Container als geleert: das ist der Normalfall,
      // und wer nichts sagt, hat geleert. Alles andere verlangt eine Angabe.
      const geleert = e ? e.geleert : status === "erledigt";
      return {
        container_id: c.id,
        geleert,
        ...(geleert ? {} : { grund: e?.grund || "Ohne Angabe stehen geblieben" }),
      };
    });

    einreihen({
      stopp_id: stopp.stopp_id,
      container,
      notiz: notiz.trim() || null,
      status,
      erfasst_am: new Date().toISOString(),
    });

    setLokalErledigt((alt) => new Set(alt).add(stopp.stopp_id));
    setOffen(warteschlange().length);
    setErfassung({});
    setNotiz("");
    setVorOrt(false);

    void schlangeLeeren();
  }

  function umschalten(containerId: string, geleert: boolean) {
    setErfassung((alt) => ({
      ...alt,
      [containerId]: { geleert, grund: alt[containerId]?.grund ?? "" },
    }));
  }

  function grundSetzen(containerId: string, grund: string) {
    setErfassung((alt) => ({
      ...alt,
      [containerId]: { geleert: alt[containerId]?.geleert ?? false, grund },
    }));
  }

  // ---------------------------------------------------------------------
  // Zustandsanzeige oben – immer sichtbar
  // ---------------------------------------------------------------------
  const kopf = (
    <div className="karte-flaeche p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{daten.tour.name ?? "Tour"}</span>
        <span className="zahl text-sm text-ink-3">
          {fertigeAnzahl} / {alleStopps.length}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-flaeche-2">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${alleStopps.length ? (fertigeAnzahl / alleStopps.length) * 100 : 0}%`,
            background: "var(--serie)",
          }}
        />
      </div>
      {(!online || offen > 0) && (
        <p className="mt-2 text-xs" style={{ color: online ? "var(--ink-3)" : "var(--ernst)" }}>
          {online
            ? `${offen} Bestätigung${offen === 1 ? "" : "en"} wird nachgesendet …`
            : `Kein Netz. ${offen} Bestätigung${offen === 1 ? "" : "en"} wartet – Sie können weiterfahren.`}
        </p>
      )}
      {daten.tour.bemerkung && (
        <p className="mt-2 rounded bg-flaeche-2 px-2 py-1 text-xs text-ink-2">
          {daten.tour.bemerkung}
        </p>
      )}
    </div>
  );

  // ---------------------------------------------------------------------
  // 1. Tour ist beendet
  // ---------------------------------------------------------------------
  if (beendet) {
    return (
      <div className="space-y-4">
        {kopf}
        <div className="karte-flaeche p-6 text-center">
          <p className="text-lg font-semibold">
            {daten.tour.status === "abgebrochen" ? "Tour abgebrochen" : "Tour abgeschlossen"}
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {fertigeAnzahl} von {alleStopps.length} Stopps erledigt. Die Disposition sieht das
            Ergebnis.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // 2. Noch nicht begonnen
  // ---------------------------------------------------------------------
  if (!gestartet) {
    return (
      <div className="space-y-4">
        {kopf}
        <div className="karte-flaeche p-5">
          <h1 className="text-lg font-semibold">Bereit?</h1>
          <p className="mt-1 text-sm text-ink-2">
            {alleStopps.length} Stopps. Sie bekommen einen nach dem anderen angezeigt – Sie müssen
            nichts suchen.
          </p>

          <ol className="mt-4 space-y-1 text-sm text-ink-2">
            {alleStopps.map((s, i) => (
              <li key={s.stopp_id}>
                <span className="zahl mr-2 text-ink-3">{i + 1}.</span>
                {s.name}
                <span className="text-ink-3"> · {s.container.length} Container</span>
              </li>
            ))}
          </ol>

          {darfFahren ? (
            <button
              type="button"
              onClick={tourStarten}
              disabled={laeuftGerade || alleStopps.length === 0}
              className="knopf-primaer mt-5 w-full py-4 text-base"
            >
              {laeuftGerade ? "Einen Moment …" : "Tour beginnen"}
            </button>
          ) : (
            <p className="mt-4 text-sm text-ink-3">
              {darfPlanen
                ? "Diese Tour ist Ihnen nicht zugewiesen – Sie sehen sie nur mit."
                : "Diese Tour ist Ihnen nicht zugewiesen."}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // 3. Alle Stopps durch
  // ---------------------------------------------------------------------
  if (!naechster) {
    return (
      <div className="space-y-4">
        {kopf}
        <div className="karte-flaeche p-6 text-center">
          <p className="text-lg font-semibold">Alle Stopps erledigt.</p>
          <p className="mt-1 text-sm text-ink-2">
            {offen > 0
              ? "Ein paar Bestätigungen warten noch auf Netz. Sie werden beim Abschließen mitgesendet."
              : "Alles ist übermittelt."}
          </p>
          {darfFahren && (
            <button
              type="button"
              onClick={tourAbschliessen}
              disabled={laeuftGerade}
              className="knopf-primaer mt-5 w-full py-4 text-base"
            >
              {laeuftGerade ? "Einen Moment …" : "Tour abschließen"}
            </button>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // 4. Vor Ort: was ist mit den Containern?
  // ---------------------------------------------------------------------
  if (vorOrt) {
    const alleEntschieden = naechster.container.every(
      (c) => erfassung[c.id] === undefined || erfassung[c.id].geleert || erfassung[c.id].grund,
    );

    return (
      <div className="space-y-4">
        {kopf}

        <div className="karte-flaeche p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">Vor Ort</p>
          <h1 className="mt-1 text-lg font-semibold">{naechster.name}</h1>

          <div className="mt-4">
            <Entsorgerhinweis entsorgung={naechster.entsorgung} gross />
          </div>

          <h2 className="mt-5 text-sm font-semibold">
            {naechster.container.length === 1
              ? "Container geleert?"
              : `${naechster.container.length} Container – was ist womit passiert?`}
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            Ohne Angabe gilt ein Container als geleert. Nur was stehen bleibt, braucht einen Grund.
          </p>

          <ul className="mt-3 space-y-3">
            {naechster.container.map((c) => {
              const e = erfassung[c.id];
              const stehenGeblieben = e && !e.geleert;

              return (
                <li key={c.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{c.bezeichnung ?? c.nummer}</span>
                      <span className="zahl ml-2 text-xs text-ink-3">{c.nummer}</span>
                      {c.fuellstand_prozent !== null && (
                        <span className="zahl ml-2 text-xs text-ink-3">
                          {c.fuellstand_prozent} %
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => umschalten(c.id, true)}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        e?.geleert ? "text-white" : "bg-flaeche text-ink-2"
                      }`}
                      style={e?.geleert ? { background: "var(--gut)", borderColor: "var(--gut)" } : undefined}
                      aria-pressed={e?.geleert === true}
                    >
                      geleert
                    </button>
                    <button
                      type="button"
                      onClick={() => umschalten(c.id, false)}
                      className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                        stehenGeblieben ? "text-white" : "bg-flaeche text-ink-2"
                      }`}
                      style={
                        stehenGeblieben
                          ? { background: "var(--ernst)", borderColor: "var(--ernst)" }
                          : undefined
                      }
                      aria-pressed={stehenGeblieben === true}
                    >
                      stehen geblieben
                    </button>
                  </div>

                  {stehenGeblieben && (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-ink-2">Warum?</label>
                      <div className="flex flex-wrap gap-1.5">
                        {GRUENDE.map((g) => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => grundSetzen(c.id, g)}
                            className={`rounded border px-2 py-1 text-xs transition ${
                              e?.grund === g ? "bg-flaeche-2 font-medium text-ink" : "text-ink-2"
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      <input
                        value={e?.grund ?? ""}
                        onChange={(ev) => grundSetzen(c.id, ev.target.value)}
                        placeholder="oder frei eintragen"
                        className="feld mt-2 text-sm"
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-4">
            <label htmlFor="notiz" className="mb-1 block text-xs font-medium text-ink-2">
              Notiz zum Standort (an die Disposition)
            </label>
            <textarea
              id="notiz"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={2}
              className="feld text-sm"
              placeholder="z. B. Poller defekt, Zufahrt nur von hinten"
            />
          </div>

          {darfFahren && (
            <>
              <button
                type="button"
                onClick={() => stoppAbschliessen(naechster, "erledigt")}
                disabled={!alleEntschieden}
                className="knopf-primaer mt-4 w-full py-4 text-base"
              >
                Fertig – weiter zum nächsten
              </button>
              {!alleEntschieden && (
                <p className="mt-1 text-center text-xs" style={{ color: "var(--ernst)" }}>
                  Bitte bei jedem stehen gebliebenen Container einen Grund angeben.
                </p>
              )}

              <button
                type="button"
                onClick={() => stoppAbschliessen(naechster, "uebersprungen")}
                className="knopf-sekundaer mt-2 w-full"
              >
                Stopp überspringen
              </button>
            </>
          )}

          <button type="button" onClick={() => setVorOrt(false)} className="mt-2 w-full text-sm text-ink-3 underline underline-offset-2">
            zurück
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // 5. Fahren: wo geht es hin?
  // ---------------------------------------------------------------------
  const nachDiesem = alleStopps.filter((s) => !erledigt(s)).length - 1;

  return (
    <div className="space-y-4">
      {kopf}

      <div className="karte-flaeche p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          Nächster Stopp · {fertigeAnzahl + 1} von {alleStopps.length}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{naechster.name}</h1>
        <p className="mt-1 text-ink-2">{anschrift(naechster) || "keine Adresse hinterlegt"}</p>

        <p className="mt-2 text-sm text-ink-3">
          {naechster.container.length}{" "}
          {naechster.container.length === 1 ? "Container" : "Container"} zu leeren
        </p>

        {naechster.zufahrt && (
          <div
            className="mt-4 rounded-lg border-l-4 bg-flaeche-2 p-3"
            style={{ borderLeftColor: "var(--warnung)" }}
          >
            <p className="text-xs font-semibold text-ink-2">Zufahrt</p>
            <p className="mt-0.5 text-sm">{naechster.zufahrt}</p>
          </div>
        )}

        {naechster.bemerkung && (
          <p className="mt-2 text-sm text-ink-2">{naechster.bemerkung}</p>
        )}

        {naechster.lat && naechster.lng && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${naechster.lat},${naechster.lng}`}
            target="_blank"
            rel="noreferrer noopener"
            className="knopf-sekundaer mt-4 w-full py-3 text-base"
          >
            Navigation starten
          </a>
        )}

        {darfFahren && (
          <button
            type="button"
            onClick={() => setVorOrt(true)}
            className="knopf-primaer mt-2 w-full py-4 text-base"
          >
            Ich bin da
          </button>
        )}

        <p className="mt-3 text-center text-xs text-ink-3">
          {nachDiesem > 0
            ? `danach noch ${nachDiesem} ${nachDiesem === 1 ? "Stopp" : "Stopps"}`
            : "letzter Stopp"}
        </p>
      </div>
    </div>
  );
}
