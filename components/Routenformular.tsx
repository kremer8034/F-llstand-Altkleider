"use client";
import { heute, tagAlsZeitpunkt } from "@/lib/zeit";

import Link from "next/link";
import { useActionState } from "react";
import { routeSpeichern, type Routenergebnis } from "@/app/intern/routen/aktionen";
import { rhythmusText, isoWochentag, wochentagName } from "@/lib/wochentage";
import type { Gruppe, Route } from "@/lib/typen";

/**
 * Der Wochentag wird nicht abgefragt, sondern aus dem Ankerdatum abgeleitet.
 * Zwei Felder, die dasselbe sagen müssen, sind eine Fehlerquelle ohne Nutzen -
 * die Datenbank lehnt eine Dienstagstour mit Donnerstagsanker ohnehin ab.
 */
export function Routenformular({
  route,
  gruppen = [],
}: {
  route?: Route;
  gruppen?: Pick<Gruppe, "id" | "name">[];
}) {
  const [ergebnis, absenden] = useActionState<Routenergebnis | null, FormData>(routeSpeichern, null);
  const r = route;

  const heutigerTag = heute();

  return (
    <form action={absenden} className="space-y-6">
      {r && <input type="hidden" name="id" value={r.id} />}

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Die Tour</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Name *
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={r?.name ?? ""}
              className="feld"
              placeholder="z. B. Tour Nord"
            />
          </div>

          <div>
            <label htmlFor="anker_datum" className="mb-1 block text-sm font-medium">
              Ein Termin, an dem gefahren wird *
            </label>
            <input
              id="anker_datum"
              name="anker_datum"
              type="date"
              required
              defaultValue={r?.anker_datum ?? heutigerTag}
              className="feld zahl"
            />
            <p className="mt-1 text-xs text-ink-3">
              Aus diesem Tag ergeben sich Wochentag und alle weiteren Termine.
            </p>
          </div>

          <div>
            <label htmlFor="intervall_wochen" className="mb-1 block text-sm font-medium">
              Abstand
            </label>
            <select
              id="intervall_wochen"
              name="intervall_wochen"
              defaultValue={String(r?.intervall_wochen ?? 2)}
              className="feld"
            >
              <option value="1">jede Woche</option>
              <option value="2">alle zwei Wochen</option>
              <option value="3">alle drei Wochen</option>
              <option value="4">alle vier Wochen</option>
              <option value="6">alle sechs Wochen</option>
              <option value="8">alle acht Wochen</option>
            </select>
          </div>

          {r && (
            <p className="text-sm text-ink-2 sm:col-span-2">
              Aktuell: <strong>{rhythmusText(r.wochentag, r.intervall_wochen)}</strong> – der
              Ankertermin fällt auf einen {wochentagName(isoWochentag(tagAlsZeitpunkt(r.anker_datum)))}.
            </p>
          )}

          <div className="sm:col-span-2">
            <label htmlFor="gruppe_id" className="mb-1 block text-sm font-medium">
              Bereitschaft
            </label>
            <select
              id="gruppe_id"
              name="gruppe_id"
              defaultValue={r?.gruppe_id ?? ""}
              className="feld"
              disabled={gruppen.length === 0}
            >
              <option value="">– keine, gemeinsame Regeltour –</option>
              {gruppen.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-3">
              {gruppen.length === 0
                ? "Noch keine Bereitschaft angelegt."
                : "Jede Tagestour, die aus dieser Regeltour entsteht, erbt die Bereitschaft."}
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="bemerkung" className="mb-1 block text-sm font-medium">
              Bemerkung
            </label>
            <textarea
              id="bemerkung"
              name="bemerkung"
              rows={2}
              defaultValue={r?.bemerkung ?? ""}
              className="feld"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="aktiv" defaultChecked={r ? r.aktiv : true} />
            Route wird gefahren
          </label>
        </div>
      </fieldset>

      {ergebnis && !ergebnis.ok && (
        <p className="karte-flaeche p-3 text-sm" style={{ color: "var(--kritisch)" }}>
          {ergebnis.fehler}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="knopf-primaer">
          Speichern
        </button>
        <Link href={r ? `/intern/routen/${r.id}` : "/intern/routen"} className="knopf-sekundaer">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
