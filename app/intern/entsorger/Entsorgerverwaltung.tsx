"use client";

import { useActionState, useState } from "react";
import type { Entsorger } from "@/lib/typen";
import { entsorgerLoeschen, entsorgerSpeichern, type Entsorgerergebnis } from "./aktionen";
import { entsorgerAufGemeindeAnwenden } from "../standorte/aktionen";

/**
 * Bauhöfe pflegen und sehen, wo noch keiner hinterlegt ist.
 *
 * Die Lückenliste oben ist der eigentliche Zweck der Seite. Eine reine
 * Stammdatenliste würde nicht zeigen, was fehlt – und was fehlt, merkt sonst
 * erst der Fahrer vor dem offenen Container.
 */
export function Entsorgerverwaltung({
  entsorger,
  zugeordnet,
  offeneGemeinden,
  ohneZuordnung,
  standorteGesamt,
}: {
  entsorger: Entsorger[];
  zugeordnet: Record<string, number>;
  offeneGemeinden: { gemeinde: string; anzahl: number }[];
  ohneZuordnung: number;
  standorteGesamt: number;
}) {
  const [bearbeitet, setBearbeitet] = useState<Entsorger | null>(null);
  const [formularOffen, setFormularOffen] = useState(false);

  const [ergebnis, absenden, laeuft] = useActionState<Entsorgerergebnis | null, FormData>(
    async (vorher, formular) => {
      const antwort = await entsorgerSpeichern(vorher, formular);
      if (antwort.ok) {
        setFormularOffen(false);
        setBearbeitet(null);
      }
      return antwort;
    },
    null,
  );

  function neu() {
    setBearbeitet(null);
    setFormularOffen(true);
  }

  function bearbeiten(e: Entsorger) {
    setBearbeitet(e);
    setFormularOffen(true);
  }

  return (
    <div className="space-y-4">
      {/* Lücken zuerst */}
      {ohneZuordnung > 0 && (
        <section
          className="karte-flaeche border-l-4 p-4"
          style={{ borderLeftColor: "var(--warnung)" }}
        >
          <h2 className="font-semibold">
            {ohneZuordnung} von {standorteGesamt} Standorten ohne Bauhof
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Dort nimmt das Fahrpersonal den Fremdmüll mit. Das ist eine gültige Lage – aber wenn es
            für die Gemeinde eine Absprache gibt, gehört sie hier hinterlegt.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {offeneGemeinden.map((g) => (
              <li
                key={g.gemeinde}
                className="rounded border bg-flaeche px-2 py-1 text-xs text-ink-2"
              >
                {g.gemeinde}
                <span className="zahl ml-1.5 text-ink-3">{g.anzahl}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-3">
          {entsorger.length} {entsorger.length === 1 ? "Eintrag" : "Einträge"}
        </span>
        {!formularOffen && (
          <button type="button" onClick={neu} className="knopf-primaer">
            Neuer Bauhof
          </button>
        )}
      </div>

      {/* Formular */}
      {formularOffen && (
        <form action={absenden} className="karte-flaeche space-y-4 p-4">
          {bearbeitet && <input type="hidden" name="id" value={bearbeitet.id} />}
          <h2 className="font-semibold">
            {bearbeitet ? `${bearbeitet.name} bearbeiten` : "Neuer Bauhof"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Name *
              </label>
              <input
                id="name"
                name="name"
                required
                defaultValue={bearbeitet?.name ?? ""}
                className="feld"
                placeholder="z. B. Bauhof Großheubach"
              />
            </div>

            <div>
              <label htmlFor="gemeinde" className="mb-1 block text-sm font-medium">
                Gemeinde
              </label>
              <input
                id="gemeinde"
                name="gemeinde"
                defaultValue={bearbeitet?.gemeinde ?? ""}
                className="feld"
                placeholder="Großheubach"
              />
              <p className="mt-1 text-xs text-ink-3">
                Wird mit dem Ort des Standorts abgeglichen und dort vorgeschlagen.
              </p>
            </div>

            <div>
              <label htmlFor="telefon" className="mb-1 block text-sm font-medium">
                Telefon
              </label>
              <input
                id="telefon"
                name="telefon"
                type="tel"
                defaultValue={bearbeitet?.telefon ?? ""}
                className="feld zahl"
                placeholder="09371 12345"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                E-Mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={bearbeitet?.email ?? ""}
                className="feld"
              />
            </div>

            <div>
              <label htmlFor="ansprechpartner" className="mb-1 block text-sm font-medium">
                Ansprechpartner
              </label>
              <input
                id="ansprechpartner"
                name="ansprechpartner"
                defaultValue={bearbeitet?.ansprechpartner ?? ""}
                className="feld"
              />
            </div>

            <div>
              <label htmlFor="erreichbar" className="mb-1 block text-sm font-medium">
                Erreichbarkeit
              </label>
              <input
                id="erreichbar"
                name="erreichbar"
                defaultValue={bearbeitet?.erreichbar ?? ""}
                className="feld"
                placeholder="Mo–Do 7–15 Uhr, Fr bis 12 Uhr"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="bemerkung" className="mb-1 block text-sm font-medium">
                Bemerkung
              </label>
              <textarea
                id="bemerkung"
                name="bemerkung"
                rows={2}
                defaultValue={bearbeitet?.bemerkung ?? ""}
                className="feld"
                placeholder="Was das Fahrpersonal wissen muss – etwa: außerhalb der Zeiten Leitstelle anrufen."
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aktiv"
              defaultChecked={bearbeitet ? bearbeitet.aktiv : true}
            />
            Absprache gilt
          </label>

          <p className="text-xs text-ink-3">
            Telefon oder E-Mail ist Pflicht. Ein Eintrag ohne Kontaktmöglichkeit sagt dem
            Fahrpersonal „es gibt eine Absprache“ und lässt es dann stehen.
          </p>

          {ergebnis?.fehler && (
            <p className="text-sm" style={{ color: "var(--kritisch)" }}>
              {ergebnis.fehler}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={laeuft} className="knopf-primaer">
              {laeuft ? "Wird gespeichert …" : "Speichern"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFormularOffen(false);
                setBearbeitet(null);
              }}
              className="knopf-sekundaer"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}

      {/* Liste */}
      {entsorger.length === 0 ? (
        <div className="karte-flaeche p-8 text-center">
          <p className="font-medium">Noch kein Bauhof hinterlegt.</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-ink-2">
            Solange hier nichts steht, zeigt die Fahreransicht an jedem Standort „Müll bitte
            mitnehmen“.
          </p>
        </div>
      ) : (
        <div className="karte-flaeche divide-y overflow-hidden">
          {entsorger.map((e) => {
            const anzahl = zugeordnet[e.id] ?? 0;
            const luecke = offeneGemeinden.find((g) => g.gemeinde === e.gemeinde);

            return (
              <div key={e.id} className={`px-4 py-3 ${e.aktiv ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      {!e.aktiv && (
                        <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                          gilt nicht
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-2">
                      {e.gemeinde ?? "ohne Gemeinde"}
                      {e.ansprechpartner && ` · ${e.ansprechpartner}`}
                    </div>
                    {e.erreichbar && (
                      <div className="mt-0.5 text-xs text-ink-3">{e.erreichbar}</div>
                    )}
                    {e.bemerkung && <div className="mt-0.5 text-xs text-ink-3">{e.bemerkung}</div>}
                  </div>

                  <div className="w-full text-sm sm:w-56">
                    {e.telefon && (
                      <a href={`tel:${e.telefon.replace(/\s/g, "")}`} className="zahl block underline underline-offset-2">
                        {e.telefon}
                      </a>
                    )}
                    {e.email && (
                      <a href={`mailto:${e.email}`} className="block text-ink-2 underline underline-offset-2">
                        {e.email}
                      </a>
                    )}
                  </div>

                  <div className="w-full text-xs text-ink-3 sm:w-32 sm:text-right">
                    {anzahl} {anzahl === 1 ? "Standort" : "Standorte"}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => bearbeiten(e)}
                      className="knopf-sekundaer px-2 py-1 text-xs"
                    >
                      Bearbeiten
                    </button>
                    <form action={entsorgerLoeschen}>
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
                        Löschen
                      </button>
                    </form>
                  </div>
                </div>

                {/* Der Handgriff, der die getrennte Tabelle erst auszahlt */}
                {luecke && e.aktiv && (
                  <form
                    action={entsorgerAufGemeindeAnwenden}
                    className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                  >
                    <input type="hidden" name="entsorger_id" value={e.id} />
                    <input type="hidden" name="gemeinde" value={e.gemeinde ?? ""} />
                    <span className="text-xs text-ink-2">
                      In {e.gemeinde} stehen {luecke.anzahl}{" "}
                      {luecke.anzahl === 1 ? "Standort" : "Standorte"} ohne Bauhof.
                    </span>
                    <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
                      Diesem Bauhof zuordnen
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
