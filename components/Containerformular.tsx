import { containerSpeichern } from "@/app/intern/container/aktionen";
import type { Container, Standort } from "@/lib/typen";

/**
 * Der Container, nachdem ihm alles genommen wurde, was doppelt war (0022).
 *
 * Anschrift und Koordinaten stehen am Platz, die Kalibrierung am Sensor, ein
 * Volumen fuehren wir nicht mehr. Was hier bleibt, ist das, was diesen einen
 * Container von seinen Nachbarn unterscheidet: seine Nummer, sein Zustand und ob
 * er nach aussen zaehlt.
 *
 * Angelegt werden Container im Regelfall gar nicht mehr hier, sondern am Platz
 * ueber die Anzahl. Dieses Formular ist fuer den Einzelfall - ein defekter
 * Container, eine Nummer, die nicht ins Schema passt.
 */
export function Containerformular({
  container: c,
  standort,
  standorte = [],
}: {
  container?: Container;
  /** Vorgegeben, wenn das Formular von einer Standortseite aus geöffnet wird. */
  standort?: Pick<Standort, "id" | "name">;
  /** Zur Auswahl, wenn nicht. Ohne Standort lässt sich kein Container anlegen. */
  standorte?: Pick<Standort, "id" | "name" | "ort">[];
}) {
  return (
    <form action={containerSpeichern} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      {!c && standort && <input type="hidden" name="standort_id" value={standort.id} />}

      {!c && standort && (
        <p className="text-sm text-ink-2">
          Wird dem Standort <strong>{standort.name}</strong> zugeordnet. Anschrift und Koordinaten
          kommen von dort – ein Container trägt keine eigenen mehr.
        </p>
      )}

      {/*
        Ohne Platz kein Container: standort_id ist seit 0022 Pflicht. Vorher
        stand hier gar kein Feld, und wer die Seite ohne `?standort=` öffnete,
        bekam beim Speichern einen rohen Datenbankfehler zu sehen.
      */}
      {!c && !standort && (
        <div className="karte-flaeche p-4">
          <label htmlFor="standort_id" className="mb-1 block text-sm font-medium">
            Standort *
          </label>
          {standorte.length === 0 ? (
            <p className="text-sm text-ink-2">
              Es gibt noch keinen Standort. Legen Sie zuerst einen an – der Container gehört auf
              einen Platz, und der trägt Anschrift und Koordinaten.
            </p>
          ) : (
            <>
              <select id="standort_id" name="standort_id" required className="feld" defaultValue="">
                <option value="" disabled>
                  Bitte wählen
                </option>
                {standorte.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                    {st.ort ? ` · ${st.ort}` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-ink-3">
                Einfacher geht es über den Platz selbst: dort sagen Sie nur, wie viele Container
                stehen, und die Nummern entstehen von allein.
              </p>
            </>
          )}
        </div>
      )}

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Der Container</legend>

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
              Systemweit eindeutig. Am Platz angelegte Container bekommen sie automatisch aus dem
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
              placeholder="optional, z. B. hinterer Container"
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
              Ausgeschaltet bleibt dieser Container in der Belegung des Platzes unberücksichtigt.
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
