"use client";

import { useState } from "react";
import { leerungErfassen, meldungErfassen } from "../aktionen";

const MELDUNGSTYPEN: { wert: string; text: string }[] = [
  { wert: "voll", text: "Container ist voll" },
  { wert: "beschaedigt", text: "Beschädigt" },
  { wert: "vermuellt", text: "Vermüllt / Fremdmüll" },
  { wert: "zugeparkt", text: "Zugeparkt / nicht erreichbar" },
  { wert: "sonstiges", text: "Sonstiges" },
];

/**
 * Was das Fahrpersonal am Container erfasst: Leerung quittieren oder einen
 * Zustand melden. Absichtlich zwei kurze Formulare statt eines langen.
 */
export function Erfassungsbereich({
  containerId,
  aktuellerFuellstand,
}: {
  containerId: string;
  aktuellerFuellstand: number | null;
}) {
  const [offen, setOffen] = useState<"leerung" | "meldung" | null>(null);

  return (
    <section className="karte-flaeche p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Vor Ort erfassen</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className={offen === "leerung" ? "knopf-sekundaer" : "knopf-primaer"}
            onClick={() => setOffen(offen === "leerung" ? null : "leerung")}
          >
            {offen === "leerung" ? "Abbrechen" : "Leerung erfassen"}
          </button>
          <button
            type="button"
            className="knopf-sekundaer"
            onClick={() => setOffen(offen === "meldung" ? null : "meldung")}
          >
            {offen === "meldung" ? "Abbrechen" : "Störung melden"}
          </button>
        </div>
      </div>

      {offen === "leerung" && (
        <form
          action={async (formular) => {
            await leerungErfassen(formular);
            setOffen(null);
          }}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <input type="hidden" name="container_id" value={containerId} />
          <input type="hidden" name="fuellstand_vorher" value={aktuellerFuellstand ?? ""} />

          <div>
            <label htmlFor="menge" className="mb-1 block text-xs text-ink-3">
              Menge (kg, optional)
            </label>
            <input id="menge" name="menge_kg" type="number" step="0.1" inputMode="decimal" className="feld zahl" />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="notiz" className="mb-1 block text-xs text-ink-3">
              Notiz (optional)
            </label>
            <input id="notiz" name="notiz" type="text" className="feld" />
          </div>

          <div className="sm:col-span-3">
            <button type="submit" className="knopf-primaer">
              Leerung speichern
            </button>
            <p className="mt-2 text-xs text-ink-3">
              Der Füllstand wird auf 0 % gesetzt. Der nächste Sensorwert korrigiert ihn automatisch.
            </p>
          </div>
        </form>
      )}

      {offen === "meldung" && (
        <form
          action={async (formular) => {
            await meldungErfassen(formular);
            setOffen(null);
          }}
          className="mt-4 grid gap-3 sm:grid-cols-3"
        >
          <input type="hidden" name="container_id" value={containerId} />

          <div>
            <label htmlFor="typ" className="mb-1 block text-xs text-ink-3">
              Art der Meldung
            </label>
            <select id="typ" name="typ" className="feld" defaultValue="sonstiges">
              {MELDUNGSTYPEN.map((t) => (
                <option key={t.wert} value={t.wert}>
                  {t.text}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="text" className="mb-1 block text-xs text-ink-3">
              Beschreibung
            </label>
            <input id="text" name="text" type="text" className="feld" />
          </div>

          <div className="sm:col-span-3">
            <button type="submit" className="knopf-primaer">
              Meldung speichern
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
