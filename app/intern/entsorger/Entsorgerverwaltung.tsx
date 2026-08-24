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
  orte,
}: {
  entsorger: Entsorger[];
  zugeordnet: Record<string, number>;
  offeneGemeinden: { gemeinde: string; anzahl: number }[];
  ohneZuordnung: number;
  standorteGesamt: number;
  /** Ortsnamen aus den Standort-Stammdaten, so wie sie dort geschrieben sind. */
  orte: { name: string; anzahl: number }[];
}) {
  const [bearbeitet, setBearbeitet] = useState<Entsorger | null>(null);
  const [formularOffen, setFormularOffen] = useState(false);

  /**
   * Die Gemeinde wird ausgewählt, nicht getippt.
   *
   * Sie ist kein beschreibendes Feld, sondern der Schlüssel, über den ein
   * Bauhof seinen Standorten zugeordnet wird - verglichen wird Zeichen für
   * Zeichen. Ein „Grossheubach" statt „Großheubach" sieht richtig aus und
   * findet doch keinen einzigen Standort; die Lückenliste oben zeigt dann
   * weiter eine Lücke, und niemand versteht, warum.
   *
   * Freitext bleibt trotzdem möglich: eine Gemeinde, in der wir heute keinen
   * Standort haben, wäre sonst nicht einzutragen.
   */
  const [gemeinde, setGemeinde] = useState("");
  const [freierOrt, setFreierOrt] = useState(false);

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

  const bekannteOrte = orte.map((o) => o.name);

  function neu(vorgabe?: string) {
    setBearbeitet(null);
    setGemeinde(vorgabe ?? "");
    setFreierOrt(vorgabe !== undefined && !bekannteOrte.includes(vorgabe));
    setFormularOffen(true);
  }

  function bearbeiten(e: Entsorger) {
    setBearbeitet(e);
    const ort = e.gemeinde ?? "";
    setGemeinde(ort);
    // Eine bereits gespeicherte Gemeinde, die in keinem Standort vorkommt,
    // darf nicht stillschweigend auf "keine" springen - sie bleibt stehen und
    // ist damit als das erkennbar, was sie ist: ein Eintrag ohne Treffer.
    setFreierOrt(ort !== "" && !bekannteOrte.includes(ort));
    setFormularOffen(true);
  }

  /** Standorte je Ortsname - für den Zusatz in der Auswahlliste. */
  const anzahlJeOrt = new Map(orte.map((o) => [o.name, o.anzahl]));
  const treffer = gemeinde ? (anzahlJeOrt.get(gemeinde) ?? 0) : 0;

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
          {/* Anklickbar, nicht nur anzeigend: der Weg von „hier fehlt einer"
              zu „hier ist einer" ist damit ein Klick statt Abtippen - und die
              Gemeinde steht anschließend zeichengenau so im Formular, wie sie
              an den Standorten steht. */}
          <ul className="mt-3 flex flex-wrap gap-2">
            {offeneGemeinden.map((g) => (
              <li key={g.gemeinde}>
                <button
                  type="button"
                  onClick={() => neu(g.gemeinde === "ohne Ort" ? undefined : g.gemeinde)}
                  disabled={g.gemeinde === "ohne Ort"}
                  title={
                    g.gemeinde === "ohne Ort"
                      ? "An diesen Standorten ist kein Ort hinterlegt – erst dort nachtragen."
                      : `Bauhof für ${g.gemeinde} anlegen`
                  }
                  className="rounded border bg-flaeche px-2.5 py-1.5 text-xs text-ink-2 transition hover:bg-flaeche-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {g.gemeinde}
                  <span className="zahl ml-1.5 text-ink-3">{g.anzahl}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-3">
            Auf eine Gemeinde tippen legt einen Bauhof dafür an – Name und Gemeinde sind dann schon
            eingetragen.
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-3">
          {entsorger.length} {entsorger.length === 1 ? "Eintrag" : "Einträge"}
        </span>
        {!formularOffen && (
          <button type="button" onClick={() => neu()} className="knopf-primaer">
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
              {/* Der Schlüssel sorgt dafür, dass der Vorschlag beim Öffnen aus
                  einer Lücke heraus wirklich im Feld steht: ohne ihn behielte
                  das Feld den Wert des vorigen Aufrufs. */}
              <input
                id="name"
                name="name"
                required
                key={`name-${bearbeitet?.id ?? gemeinde}`}
                defaultValue={bearbeitet?.name ?? (gemeinde ? `Bauhof ${gemeinde}` : "")}
                className="feld"
                placeholder="z. B. Bauhof Großheubach"
              />
            </div>

            <div>
              <label htmlFor="gemeinde" className="mb-1 block text-sm font-medium">
                Gemeinde
              </label>

              {freierOrt || orte.length === 0 ? (
                <>
                  <input
                    id="gemeinde"
                    name="gemeinde"
                    value={gemeinde}
                    onChange={(e) => setGemeinde(e.target.value)}
                    className="feld"
                    placeholder="Großheubach"
                  />
                  {orte.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setFreierOrt(false);
                        if (!bekannteOrte.includes(gemeinde)) setGemeinde("");
                      }}
                      className="mt-1 text-xs underline underline-offset-2"
                    >
                      doch aus den Stammdaten wählen
                    </button>
                  )}
                </>
              ) : (
                <>
                  <select
                    id="gemeinde"
                    name="gemeinde"
                    value={gemeinde}
                    onChange={(e) => {
                      if (e.target.value === "__frei__") {
                        setFreierOrt(true);
                        setGemeinde("");
                      } else {
                        setGemeinde(e.target.value);
                      }
                    }}
                    className="feld"
                  >
                    <option value="">– keine Gemeinde –</option>
                    {orte.map((o) => (
                      <option key={o.name} value={o.name}>
                        {o.name} ({o.anzahl} {o.anzahl === 1 ? "Standort" : "Standorte"})
                      </option>
                    ))}
                    <option value="__frei__">– andere Gemeinde eintippen –</option>
                  </select>
                </>
              )}

              <p className="mt-1 text-xs text-ink-3">
                {freierOrt || orte.length === 0
                  ? "Frei eingetragen: Standorte werden nur gefunden, wenn die Schreibweise dort genau gleich ist."
                  : gemeinde
                    ? `Trifft ${treffer} ${treffer === 1 ? "Standort" : "Standorte"} – Schreibweise stimmt damit.`
                    : "Zur Auswahl stehen die Orte, die an den Standorten hinterlegt sind. Danach wird abgeglichen."}
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
