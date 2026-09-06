import { containerSpeichern } from "@/app/intern/container/aktionen";
import type { Container, Standort } from "@/lib/typen";

/**
 * Der Behaelter, nachdem ihm alles genommen wurde, was doppelt war (0022).
 *
 * Anschrift und Koordinaten stehen am Platz, die Kalibrierung am Sensor, ein
 * Volumen fuehren wir nicht mehr. Was hier bleibt, ist das, was diesen einen
 * Kuebel von seinen Nachbarn unterscheidet: seine Nummer, sein Zustand und ob
 * er nach aussen zaehlt.
 *
 * Angelegt werden Behaelter im Regelfall gar nicht mehr hier, sondern am Platz
 * ueber die Anzahl. Dieses Formular ist fuer den Einzelfall - ein defekter
 * Kuebel, eine Nummer, die nicht ins Schema passt.
 */
export function Containerformular({
  container: c,
  standort,
}: {
  container?: Container;
  standort?: Pick<Standort, "id" | "name">;
}) {
  return (
    <form action={containerSpeichern} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      {!c && standort && <input type="hidden" name="standort_id" value={standort.id} />}

      {!c && standort && (
        <p className="text-sm text-ink-2">
          Wird dem Standort <strong>{standort.name}</strong> zugeordnet. Anschrift und Koordinaten
          kommen von dort – ein Behälter trägt keine eigenen mehr.
        </p>
      )}

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Der Behälter</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nummer" className="mb-1 block text-sm font-medium">
              Nummer
            </label>
            <input
              id="nummer"
              name="nummer"
              required
              defaultValue={c?.nummer ?? ""}
              className="feld zahl"
              placeholder="z. B. RKL-3"
            />
            <p className="mt-1 text-xs text-ink-3">
              Systemweit eindeutig. Am Platz angelegte Behälter bekommen sie automatisch aus dem
              Kürzel des Platzes.
            </p>
          </div>

          <div>
            <label htmlFor="bezeichnung" className="mb-1 block text-sm font-medium">
              Bezeichnung
            </label>
            <input
              id="bezeichnung"
              name="bezeichnung"
              defaultValue={c?.bezeichnung ?? ""}
              className="feld"
              placeholder="optional, z. B. hinterer Kübel"
            />
          </div>

          <div>
            <label htmlFor="typ" className="mb-1 block text-sm font-medium">
              Typ
            </label>
            <input id="typ" name="typ" defaultValue={c?.typ ?? "Depotcontainer"} className="feld" />
          </div>

          <div>
            <label htmlFor="aufstelldatum" className="mb-1 block text-sm font-medium">
              Aufstelldatum
            </label>
            <input
              id="aufstelldatum"
              name="aufstelldatum"
              type="date"
              defaultValue={c?.aufstelldatum ?? ""}
              className="feld"
            />
          </div>

          <div>
            <label htmlFor="status" className="mb-1 block text-sm font-medium">
              Status
            </label>
            <select id="status" name="status" defaultValue={c?.status ?? "aktiv"} className="feld">
              <option value="aktiv">aktiv</option>
              <option value="inaktiv">inaktiv</option>
              <option value="defekt">defekt</option>
              <option value="entfernt">entfernt</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="oeffentlich" defaultChecked={c?.oeffentlich ?? true} />
              Zählt für die öffentliche Anzeige des Platzes
            </label>
            <p className="mt-1 text-xs text-ink-3">
              Ausgeschaltet bleibt dieser Behälter in der Belegung des Platzes unberücksichtigt.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="bemerkung" className="mb-1 block text-sm font-medium">
              Bemerkung
            </label>
            <textarea
              id="bemerkung"
              name="bemerkung"
              rows={3}
              defaultValue={c?.bemerkung ?? ""}
              className="feld"
            />
          </div>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="knopf-primaer">
          Speichern
        </button>
        <a
          href={
            c
              ? `/intern/container/${c.id}`
              : standort
                ? `/intern/standorte/${standort.id}`
                : "/intern/standorte?ansicht=container"
          }
          className="knopf-sekundaer"
        >
          Abbrechen
        </a>
      </div>
    </form>
  );
}
