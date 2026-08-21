"use client";

import { useState } from "react";
import { benutzerEinladen, type EinladungErgebnis } from "./aktionen";

export function Einladungsformular() {
  const [ergebnis, setErgebnis] = useState<EinladungErgebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    const formular = ereignis.currentTarget;
    setLaeuft(true);
    const antwort = await benutzerEinladen(null, new FormData(formular));
    setErgebnis(antwort);
    setLaeuft(false);
    if (antwort.ok) formular.reset();
  }

  return (
    <form onSubmit={absenden} className="karte-flaeche p-4">
      <h2 className="mb-3 font-semibold">Neuen Zugang einladen</h2>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="email" className="mb-1 block text-xs text-ink-3">
            E-Mail-Adresse
          </label>
          <input id="email" name="email" type="email" required className="feld" />
        </div>

        <div>
          <label htmlFor="name" className="mb-1 block text-xs text-ink-3">
            Name
          </label>
          <input id="name" name="name" className="feld" />
        </div>

        <div>
          <label htmlFor="rolle" className="mb-1 block text-xs text-ink-3">
            Rolle
          </label>
          <select id="rolle" name="rolle" defaultValue="fahrer" className="feld">
            <option value="fahrer">Fahrpersonal</option>
            <option value="dispo">Disposition</option>
            <option value="admin">Administration</option>
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={laeuft} className="knopf-primaer">
          {laeuft ? "Wird gesendet …" : "Einladung senden"}
        </button>

        {ergebnis?.hinweis && <span className="text-sm text-ink-2">{ergebnis.hinweis}</span>}
        {ergebnis?.fehler && (
          <span className="text-sm" style={{ color: "var(--kritisch)" }}>
            {ergebnis.fehler}
          </span>
        )}
      </div>
    </form>
  );
}
