"use client";

import { useEffect, useState } from "react";
import {
  benutzerAnlegen,
  benutzerEinladen,
  passwortVorschlagen,
  type AnlageErgebnis,
  type EinladungErgebnis,
} from "./aktionen";

type Weg = "direkt" | "einladung";

export function Einladungsformular() {
  const [weg, setWeg] = useState<Weg>("direkt");
  const [passwort, setPasswort] = useState("");
  const [angelegt, setAngelegt] = useState<AnlageErgebnis | null>(null);
  const [eingeladen, setEingeladen] = useState<EinladungErgebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    passwortVorschlagen().then(setPasswort);
  }, []);

  async function neuesPasswort() {
    setPasswort(await passwortVorschlagen());
  }

  async function absenden(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    const formular = ereignis.currentTarget;
    const daten = new FormData(formular);

    setLaeuft(true);
    setAngelegt(null);
    setEingeladen(null);

    if (weg === "direkt") {
      const antwort = await benutzerAnlegen(null, daten);
      setAngelegt(antwort);
      if (antwort.ok) {
        formular.reset();
        await neuesPasswort();
      }
    } else {
      const antwort = await benutzerEinladen(null, daten);
      setEingeladen(antwort);
      if (antwort.ok) formular.reset();
    }

    setLaeuft(false);
  }

  return (
    <div className="karte-flaeche p-4">
      <h2 className="mb-3 font-semibold">Neuen Zugang anlegen</h2>

      {/* Weg wählen */}
      <div className="mb-4 inline-flex rounded-lg border bg-flaeche p-0.5" role="group">
        {(
          [
            ["direkt", "Mit Startpasswort"],
            ["einladung", "Einladung per E-Mail"],
          ] as [Weg, string][]
        ).map(([wert, text]) => (
          <button
            key={wert}
            type="button"
            onClick={() => setWeg(wert)}
            aria-pressed={weg === wert}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              weg === wert ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-ink-2">
        {weg === "direkt"
          ? "Das Konto wird sofort angelegt und ist gleich nutzbar. Das Startpasswort geben Sie persönlich weiter – es wird nur einmal angezeigt. Für Fahrpersonal ohne eigene Dienstadresse ist das der praktikable Weg."
          : "Die Person erhält eine E-Mail mit einem Link und vergibt sich selbst ein Passwort. Das setzt einen eingerichteten Mailversand voraus – ohne eigenen Mailserver begrenzt Supabase ihn auf wenige Mails pro Stunde."}
      </p>

      <form onSubmit={absenden} className="space-y-3">
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

          {weg === "direkt" && (
            <div className="sm:col-span-4">
              <label htmlFor="passwort" className="mb-1 block text-xs text-ink-3">
                Startpasswort
              </label>
              <div className="flex gap-2">
                <input
                  id="passwort"
                  name="passwort"
                  value={passwort}
                  onChange={(e) => setPasswort(e.target.value)}
                  minLength={10}
                  required
                  className="feld zahl flex-1"
                />
                <button type="button" onClick={neuesPasswort} className="knopf-sekundaer shrink-0">
                  Neu würfeln
                </button>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                Vorgeschlagen wird ein Passwort ohne verwechselbare Zeichen – es lässt sich am
                Telefon vorlesen. Änderbar.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={laeuft} className="knopf-primaer">
            {laeuft
              ? "Wird ausgeführt …"
              : weg === "direkt"
                ? "Zugang anlegen"
                : "Einladung senden"}
          </button>

          {eingeladen?.hinweis && <span className="text-sm text-ink-2">{eingeladen.hinweis}</span>}
          {(angelegt?.fehler || eingeladen?.fehler) && (
            <span className="text-sm" style={{ color: "var(--kritisch)" }}>
              {angelegt?.fehler ?? eingeladen?.fehler}
            </span>
          )}
        </div>
      </form>

      {/* Zugangsdaten – nur einmal sichtbar */}
      {angelegt?.ok && (
        <div className="mt-4 rounded-lg border p-4">
          <h3 className="text-sm font-semibold">Zugang angelegt</h3>
          <p className="mt-1 text-xs text-ink-3">
            Diese Angaben werden <strong>nur jetzt</strong> angezeigt. Notieren oder gleich
            weitergeben – danach lässt sich das Passwort nur noch neu setzen.
          </p>

          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Adresse</dt>
              <dd className="zahl font-medium">{angelegt.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Startpasswort</dt>
              <dd className="zahl text-base font-semibold tracking-wide">{angelegt.passwort}</dd>
            </div>
          </dl>

          <button
            type="button"
            className="knopf-sekundaer mt-3"
            onClick={async () => {
              await navigator.clipboard.writeText(
                `Anmeldung: ${window.location.origin}/login\nAdresse: ${angelegt.email}\nPasswort: ${angelegt.passwort}`,
              );
              setKopiert(true);
              setTimeout(() => setKopiert(false), 2000);
            }}
          >
            {kopiert ? "kopiert" : "Zugangsdaten kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}
