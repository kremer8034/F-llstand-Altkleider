"use client";

import { useState } from "react";
import { passwortNeuSetzen, passwortVorschlagen } from "./aktionen";

/**
 * Passwort eines Zugangs neu setzen, ohne E-Mail. Gedacht für den Fall
 * "Kollege hat sein Passwort vergessen und keine erreichbare Dienstadresse".
 */
export function PasswortSetzen({ id, name }: { id: string; name: string }) {
  const [offen, setOffen] = useState(false);
  const [passwort, setPasswort] = useState("");
  const [fertig, setFertig] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function oeffnen() {
    setPasswort(await passwortVorschlagen());
    setFertig(null);
    setFehler(null);
    setOffen(true);
  }

  async function speichern() {
    setLaeuft(true);
    const daten = new FormData();
    daten.set("id", id);
    daten.set("passwort", passwort);

    const antwort = await passwortNeuSetzen(null, daten);
    setLaeuft(false);

    if (antwort.ok) {
      setFertig(antwort.passwort ?? passwort);
      setOffen(false);
    } else {
      setFehler(antwort.fehler ?? "Das hat nicht geklappt.");
    }
  }

  if (fertig) {
    return (
      <div className="text-right text-xs">
        <div className="text-ink-3">neues Passwort für {name}</div>
        <div className="zahl text-sm font-semibold">{fertig}</div>
        <button
          type="button"
          onClick={() => setFertig(null)}
          className="mt-1 underline underline-offset-2 text-ink-3"
        >
          ausblenden
        </button>
      </div>
    );
  }

  if (!offen) {
    return (
      <button type="button" onClick={oeffnen} className="knopf-sekundaer px-3 py-1">
        Passwort setzen
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        value={passwort}
        onChange={(e) => setPasswort(e.target.value)}
        minLength={10}
        className="feld zahl w-44 py-1 text-sm"
        aria-label={`Neues Passwort für ${name}`}
      />
      <button type="button" onClick={speichern} disabled={laeuft} className="knopf-primaer px-3 py-1">
        {laeuft ? "…" : "Setzen"}
      </button>
      <button type="button" onClick={() => setOffen(false)} className="knopf-sekundaer px-3 py-1">
        Abbrechen
      </button>
      {fehler && (
        <span className="w-full text-right text-xs" style={{ color: "var(--kritisch)" }}>
          {fehler}
        </span>
      )}
    </div>
  );
}
