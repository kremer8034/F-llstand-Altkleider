import { containerSpeichern } from "@/app/intern/container/aktionen";
import type { Container } from "@/lib/typen";

/** Ein Formular für Anlegen und Bearbeiten - Unterschied ist nur die id. */
export function Containerformular({ container }: { container?: Container }) {
  const c = container;

  return (
    <form action={containerSpeichern} className="space-y-6">
      {c && <input type="hidden" name="id" value={c.id} />}

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Stammdaten</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="nummer" className="mb-1 block text-sm font-medium">
              Containernummer *
            </label>
            <input id="nummer" name="nummer" required defaultValue={c?.nummer ?? ""} className="feld zahl" />
          </div>

          <div>
            <label htmlFor="externe_id" className="mb-1 block text-sm font-medium">
              ID Dienstleistungsdatenbank
            </label>
            <input
              id="externe_id"
              name="externe_id"
              defaultValue={c?.externe_id ?? ""}
              className="feld zahl"
              placeholder="optional"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="bezeichnung" className="mb-1 block text-sm font-medium">
              Standortbezeichnung
            </label>
            <input
              id="bezeichnung"
              name="bezeichnung"
              defaultValue={c?.bezeichnung ?? ""}
              className="feld"
              placeholder="z. B. Netto Parkplatz"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="strasse" className="mb-1 block text-sm font-medium">
              Straße und Hausnummer
            </label>
            <input id="strasse" name="strasse" defaultValue={c?.strasse ?? ""} className="feld" />
          </div>

          <div>
            <label htmlFor="plz" className="mb-1 block text-sm font-medium">
              PLZ
            </label>
            <input id="plz" name="plz" defaultValue={c?.plz ?? ""} className="feld zahl" />
          </div>

          <div>
            <label htmlFor="ort" className="mb-1 block text-sm font-medium">
              Ort
            </label>
            <input id="ort" name="ort" defaultValue={c?.ort ?? ""} className="feld" />
          </div>

          <div>
            <label htmlFor="lat" className="mb-1 block text-sm font-medium">
              Breitengrad
            </label>
            <input
              id="lat"
              name="lat"
              type="number"
              step="0.000001"
              defaultValue={c?.lat ?? ""}
              className="feld zahl"
              placeholder="49.705"
            />
          </div>

          <div>
            <label htmlFor="lng" className="mb-1 block text-sm font-medium">
              Längengrad
            </label>
            <input
              id="lng"
              name="lng"
              type="number"
              step="0.000001"
              defaultValue={c?.lng ?? ""}
              className="feld zahl"
              placeholder="9.253"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Technik und Betrieb</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="typ" className="mb-1 block text-sm font-medium">
              Typ
            </label>
            <input id="typ" name="typ" defaultValue={c?.typ ?? "Depotcontainer"} className="feld" />
          </div>

          <div>
            <label htmlFor="volumen_liter" className="mb-1 block text-sm font-medium">
              Volumen (Liter)
            </label>
            <input
              id="volumen_liter"
              name="volumen_liter"
              type="number"
              defaultValue={c?.volumen_liter ?? ""}
              className="feld zahl"
            />
          </div>

          <div>
            <label htmlFor="leer_abstand_mm" className="mb-1 block text-sm font-medium">
              Leerwert (mm)
            </label>
            <input
              id="leer_abstand_mm"
              name="leer_abstand_mm"
              type="number"
              defaultValue={c?.leer_abstand_mm ?? ""}
              className="feld zahl"
            />
          </div>

          <div>
            <label htmlFor="voll_abstand_mm" className="mb-1 block text-sm font-medium">
              Vollwert (mm)
            </label>
            <input
              id="voll_abstand_mm"
              name="voll_abstand_mm"
              type="number"
              defaultValue={c?.voll_abstand_mm ?? ""}
              className="feld zahl"
            />
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
              Auf der öffentlichen Karte anzeigen
            </label>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="bemerkung" className="mb-1 block text-sm font-medium">
              Bemerkung
            </label>
            <textarea id="bemerkung" name="bemerkung" rows={3} defaultValue={c?.bemerkung ?? ""} className="feld" />
          </div>
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className="knopf-primaer">
          Speichern
        </button>
        <a
          href={c ? `/intern/container/${c.id}` : "/intern/standorte?ansicht=container"}
          className="knopf-sekundaer"
        >
          Abbrechen
        </a>
      </div>
    </form>
  );
}
