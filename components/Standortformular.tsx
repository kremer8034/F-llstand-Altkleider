import Link from "next/link";
import { standortSpeichern } from "@/app/intern/standorte/aktionen";
import type { Entsorger, Standort } from "@/lib/typen";

/** Ein Formular für Anlegen und Bearbeiten - Unterschied ist nur die id. */
export function Standortformular({
  standort,
  entsorger = [],
}: {
  standort?: Standort;
  entsorger?: Entsorger[];
}) {
  const s = standort;

  return (
    <form action={standortSpeichern} className="space-y-6">
      {s && <input type="hidden" name="id" value={s.id} />}

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Der Platz</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Name *
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={s?.name ?? ""}
              className="feld"
              placeholder="z. B. Netto Parkplatz Großheubach"
            />
            <p className="mt-1 text-xs text-ink-3">
              So, wie das Fahrpersonal den Platz nennt – nicht die Containernummer.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="strasse" className="mb-1 block text-sm font-medium">
              Straße und Hausnummer
            </label>
            <input id="strasse" name="strasse" defaultValue={s?.strasse ?? ""} className="feld" />
          </div>

          <div>
            <label htmlFor="plz" className="mb-1 block text-sm font-medium">
              PLZ
            </label>
            <input id="plz" name="plz" defaultValue={s?.plz ?? ""} className="feld zahl" />
          </div>

          <div>
            <label htmlFor="ort" className="mb-1 block text-sm font-medium">
              Ort
            </label>
            <input id="ort" name="ort" defaultValue={s?.ort ?? ""} className="feld" />
          </div>

          <div>
            <label htmlFor="lat" className="mb-1 block text-sm font-medium">
              Breitengrad
            </label>
            <input
              id="lat"
              name="lat"
              defaultValue={s?.lat ?? ""}
              className="feld zahl"
              placeholder="49.7333"
            />
          </div>

          <div>
            <label htmlFor="lng" className="mb-1 block text-sm font-medium">
              Längengrad
            </label>
            <input
              id="lng"
              name="lng"
              defaultValue={s?.lng ?? ""}
              className="feld zahl"
              placeholder="9.2167"
            />
          </div>

          <p className="text-xs text-ink-3 sm:col-span-2">
            Ohne Koordinaten nimmt die Tourenplanung den Mittelwert der Container an diesem Platz.
          </p>
        </div>
      </fieldset>

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Für die Anfahrt</legend>

        <div className="space-y-4">
          <div>
            <label htmlFor="zufahrt" className="mb-1 block text-sm font-medium">
              Zufahrt
            </label>
            <textarea
              id="zufahrt"
              name="zufahrt"
              rows={2}
              defaultValue={s?.zufahrt ?? ""}
              className="feld"
              placeholder="z. B. Einfahrt hinter dem Markt, Poller mit Dreikantschlüssel"
            />
            <p className="mt-1 text-xs text-ink-3">
              Steht in der Tourenliste beim Stopp – alles, was das Fahrpersonal vor Ort wissen muss.
            </p>
          </div>

          <div>
            <label htmlFor="entsorger_id" className="mb-1 block text-sm font-medium">
              Zuständiger Bauhof bei Fremdmüll
            </label>
            <select
              id="entsorger_id"
              name="entsorger_id"
              defaultValue={s?.entsorger_id ?? ""}
              className="feld"
            >
              <option value="">– keiner, Müll wird mitgenommen –</option>
              {entsorger.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.gemeinde ? ` · ${e.gemeinde}` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-3">
              Ist ein Bauhof hinterlegt, lässt das Fahrpersonal den Müll stehen und ruft an. Ohne
              Eintrag nimmt es ihn mit.
            </p>
          </div>

          <div>
            <label htmlFor="bemerkung" className="mb-1 block text-sm font-medium">
              Bemerkung
            </label>
            <textarea
              id="bemerkung"
              name="bemerkung"
              rows={2}
              defaultValue={s?.bemerkung ?? ""}
              className="feld"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="aktiv" defaultChecked={s ? s.aktiv : true} />
            Standort wird angefahren
          </label>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="knopf-primaer">
          Speichern
        </button>
        <Link href={s ? `/intern/standorte/${s.id}` : "/intern/standorte"} className="knopf-sekundaer">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
