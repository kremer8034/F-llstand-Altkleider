"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Mehrfachauswahl } from "@/components/Mehrfachauswahl";
import type { Gruppe } from "@/lib/typen";
import {
  gruppeLoeschen,
  gruppeSpeichern,
  regeltourenZuordnen,
  standorteZuordnen,
  type Gruppenergebnis,
} from "./aktionen";

export interface Gruppenzeile extends Gruppe {
  standorte: number;
  regeltouren: number;
  benutzer: { id: string; name: string; rolle: string }[];
}

/**
 * Bereitschaften pflegen und ihnen Standorte und Regeltouren zuordnen.
 *
 * Die Zuordnung steht hier und nicht nur am einzelnen Standort. Beides hat
 * seinen Platz: am Standort wird eine einzelne Entscheidung getroffen, hier
 * wird ein Gebiet aufgeteilt - und dreißig Plätze einzeln aufzusuchen, um
 * einer neuen Bereitschaft ihr Gebiet zu geben, ist kein Arbeitsablauf.
 */
export function Gruppenverwaltung({
  gruppen,
  standorte,
  regeltouren,
  standorteOhneGruppe,
  routenOhneGruppe,
}: {
  gruppen: Gruppenzeile[];
  standorte: { id: string; name: string; ort: string | null; gruppe_id: string | null }[];
  regeltouren: { id: string; name: string; rhythmus: string; gruppe_id: string | null }[];
  standorteOhneGruppe: number;
  routenOhneGruppe: number;
}) {
  const [bearbeitet, setBearbeitet] = useState<Gruppe | null>(null);
  const [formularOffen, setFormularOffen] = useState(false);
  const [zuordnung, setZuordnung] = useState<string | null>(null);

  const [ergebnis, absenden, laeuft] = useActionState<Gruppenergebnis | null, FormData>(
    async (vorher, formular) => {
      const antwort = await gruppeSpeichern(vorher, formular);
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

  function bearbeiten(g: Gruppe) {
    setBearbeitet(g);
    setFormularOffen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-ink-3">
          {gruppen.length} {gruppen.length === 1 ? "Bereitschaft" : "Bereitschaften"}
          {gruppen.length > 0 && (
            <>
              {" · "}
              {standorteOhneGruppe} {standorteOhneGruppe === 1 ? "Standort" : "Standorte"} und{" "}
              {routenOhneGruppe} {routenOhneGruppe === 1 ? "Regeltour" : "Regeltouren"} ohne
              Zuordnung
            </>
          )}
        </span>
        {!formularOffen && (
          <button type="button" onClick={neu} className="knopf-primaer">
            Neue Bereitschaft
          </button>
        )}
      </div>

      {/* Stammdaten */}
      {formularOffen && (
        <form action={absenden} className="karte-flaeche space-y-4 p-4">
          {bearbeitet && <input type="hidden" name="id" value={bearbeitet.id} />}
          <h2 className="font-semibold">
            {bearbeitet ? `${bearbeitet.name} bearbeiten` : "Neue Bereitschaft"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Name *
              </label>
              <input
                id="name"
                name="name"
                required
                defaultValue={bearbeitet?.name ?? ""}
                className="feld"
                placeholder="z. B. Bereitschaft Großheubach"
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

            <div className="sm:col-span-2">
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
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="aktiv"
              defaultChecked={bearbeitet ? bearbeitet.aktiv : true}
            />
            Bereitschaft ist im Einsatz
          </label>

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

      {/* Die Liste */}
      {gruppen.length === 0 ? (
        <div className="karte-flaeche p-8 text-center">
          <p className="font-medium">Noch keine Bereitschaft angelegt.</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-ink-2">
            Solange hier nichts steht, sieht jede Disposition alles – so, wie es bisher war. Erst
            eine angelegte Bereitschaft mit zugeordneten Konten schränkt etwas ein.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gruppen.map((g) => {
            const offen = zuordnung === g.id;

            return (
              <section key={g.id} className={`karte-flaeche p-4 ${g.aktiv ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{g.name}</h2>
                      {!g.aktiv && (
                        <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                          nicht im Einsatz
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-2">
                      {g.ansprechpartner ?? "kein Ansprechpartner hinterlegt"}
                    </div>
                    {g.bemerkung && <div className="mt-0.5 text-xs text-ink-3">{g.bemerkung}</div>}
                  </div>

                  <div className="w-full text-sm sm:w-56">
                    {g.telefon && (
                      <a
                        href={`tel:${g.telefon.replace(/\s/g, "")}`}
                        className="zahl block underline underline-offset-2"
                      >
                        {g.telefon}
                      </a>
                    )}
                    {g.email && (
                      <a
                        href={`mailto:${g.email}`}
                        className="block text-ink-2 underline underline-offset-2"
                      >
                        {g.email}
                      </a>
                    )}
                    {!g.telefon && !g.email && (
                      <span className="text-ink-3">keine Kontaktdaten</span>
                    )}
                  </div>

                  <div className="w-full text-xs text-ink-3 sm:w-40 sm:text-right">
                    <div>
                      {g.standorte} {g.standorte === 1 ? "Standort" : "Standorte"}
                    </div>
                    <div>
                      {g.regeltouren} {g.regeltouren === 1 ? "Regeltour" : "Regeltouren"}
                    </div>
                    <div>
                      {g.benutzer.length} {g.benutzer.length === 1 ? "Zugang" : "Zugänge"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setZuordnung(offen ? null : g.id)}
                      className="knopf-sekundaer px-2 py-1 text-xs"
                    >
                      {offen ? "Zuordnung schließen" : "Standorte und Touren"}
                    </button>
                    <button
                      type="button"
                      onClick={() => bearbeiten(g)}
                      className="knopf-sekundaer px-2 py-1 text-xs"
                    >
                      Bearbeiten
                    </button>
                    <form action={gruppeLoeschen}>
                      <input type="hidden" name="id" value={g.id} />
                      <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
                        Löschen
                      </button>
                    </form>
                  </div>
                </div>

                {/* Wer diese Bereitschaft verwalten darf */}
                {g.benutzer.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs">
                    <span className="text-ink-3">Zugänge:</span>
                    {g.benutzer.map((b) => (
                      <span key={b.id} className="rounded border bg-flaeche px-1.5 py-0.5 text-ink-2">
                        {b.name}
                        <span className="ml-1 text-ink-3">{b.rolle}</span>
                      </span>
                    ))}
                    <Link
                      href="/intern/benutzer"
                      className="ml-1 underline underline-offset-2 text-ink-3"
                    >
                      ändern
                    </Link>
                  </div>
                )}

                {/* Zuordnung von Standorten und Regeltouren */}
                {offen && (
                  <div className="mt-4 grid gap-6 border-t pt-4 lg:grid-cols-2">
                    <form action={standorteZuordnen} className="space-y-3">
                      <input type="hidden" name="gruppe_id" value={g.id} />
                      <h3 className="text-sm font-semibold">Standorte dieser Bereitschaft</h3>
                      <p className="text-xs text-ink-3">
                        Die Auswahl ist der vollständige Stand: was nicht angehakt ist, wird
                        gelöst und fällt in die gemeinsame Zuständigkeit zurück.
                      </p>
                      <Mehrfachauswahl
                        key={`st-${g.id}`}
                        name="standort_id"
                        beschriftung="Standorte"
                        leerText="Es gibt noch keinen Standort."
                        eintraege={standorte.map((st) => ({
                          id: st.id,
                          titel: st.name,
                          unterzeile: st.ort,
                          hinweis:
                            st.gruppe_id === null
                              ? null
                              : st.gruppe_id === g.id
                                ? "hier"
                                : (gruppen.find((x) => x.id === st.gruppe_id)?.name ?? "andere"),
                          vorgewaehlt: st.gruppe_id === g.id,
                        }))}
                      />
                      <button type="submit" className="knopf-primaer">
                        Standorte übernehmen
                      </button>
                    </form>

                    <form action={regeltourenZuordnen} className="space-y-3">
                      <input type="hidden" name="gruppe_id" value={g.id} />
                      <h3 className="text-sm font-semibold">Regeltouren dieser Bereitschaft</h3>
                      <p className="text-xs text-ink-3">
                        Eine Tagestour aus einer Regeltour erbt deren Bereitschaft – das ist der
                        häufigste Weg, auf dem eine Tour ihre Zuordnung bekommt.
                      </p>
                      <Mehrfachauswahl
                        key={`rt-${g.id}`}
                        name="route_id"
                        beschriftung="Regeltouren"
                        leerText="Es gibt noch keine Regeltour."
                        eintraege={regeltouren.map((r) => ({
                          id: r.id,
                          titel: r.name,
                          unterzeile: r.rhythmus,
                          hinweis:
                            r.gruppe_id === null
                              ? null
                              : r.gruppe_id === g.id
                                ? "hier"
                                : (gruppen.find((x) => x.id === r.gruppe_id)?.name ?? "andere"),
                          vorgewaehlt: r.gruppe_id === g.id,
                        }))}
                      />
                      <button type="submit" className="knopf-primaer">
                        Regeltouren übernehmen
                      </button>
                    </form>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
