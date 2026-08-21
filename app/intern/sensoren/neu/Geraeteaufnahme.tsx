"use client";

import Link from "next/link";
import { useState } from "react";
import { sensorAnlegen, type AnlageErgebnis } from "../aktionen";

export function Geraeteaufnahme() {
  const [ergebnis, setErgebnis] = useState<AnlageErgebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  async function absenden(ereignis: React.FormEvent<HTMLFormElement>) {
    ereignis.preventDefault();
    setLaeuft(true);
    const antwort = await sensorAnlegen(null, new FormData(ereignis.currentTarget));
    setErgebnis(antwort);
    setLaeuft(false);
  }

  if (ergebnis?.ok) {
    const konfiguration = [
      "// include/geheimnisse.h  -  nicht ins Repository einchecken!",
      "#pragma once",
      `#define GERAETE_ID    "${ergebnis.geraete_id}"`,
      `#define GERAETE_KEY   "${ergebnis.geheimnis}"`,
    ].join("\n");

    return (
      <div className="space-y-4">
        <div className="karte-flaeche p-5">
          <h2 className="font-semibold">Gerät angelegt</h2>
          <p className="mt-1 text-sm text-ink-2">
            Der Geräteschlüssel wird <strong>nur jetzt</strong> angezeigt. Übernehmen Sie ihn in die
            Firmware, bevor Sie diese Seite verlassen.
          </p>

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Geräte-ID</dt>
              <dd className="zahl text-lg font-semibold">{ergebnis.geraete_id}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Anlerncode (auf den Aufkleber)</dt>
              <dd className="zahl text-lg font-semibold tracking-widest">{ergebnis.anlerncode}</dd>
            </div>
          </dl>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-ink-3">Geräteschlüssel für die Firmware</span>
              <button
                type="button"
                className="text-xs underline underline-offset-2"
                onClick={async () => {
                  await navigator.clipboard.writeText(konfiguration);
                  setKopiert(true);
                  setTimeout(() => setKopiert(false), 2000);
                }}
              >
                {kopiert ? "kopiert" : "kopieren"}
              </button>
            </div>
            <pre className="zahl overflow-x-auto rounded-lg border bg-flaeche-2 p-3 text-xs">
              {konfiguration}
            </pre>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/intern/sensoren" className="knopf-primaer">
              Zur Sensorliste
            </Link>
            <button type="button" onClick={() => setErgebnis(null)} className="knopf-sekundaer">
              Nächstes Gerät aufnehmen
            </button>
          </div>
        </div>

        <p className="text-xs text-ink-3">
          Alternative ohne Flashen des Schlüssels: die Firmware holt sich beim allerersten Start ihr
          Geheimnis selbst über <span className="zahl">/api/geraete/registrieren</span> ab. Das geht
          pro Gerät genau einmal.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Gerät</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="geraete_id" className="mb-1 block text-sm font-medium">
              Geräte-ID *
            </label>
            <input
              id="geraete_id"
              name="geraete_id"
              required
              placeholder="z. B. ALT-0042"
              className="feld zahl"
            />
            <p className="mt-1 text-xs text-ink-3">
              Frei wählbar, muss aber eindeutig sein und außen am Gehäuse stehen.
            </p>
          </div>

          <div>
            <label htmlFor="imei" className="mb-1 block text-sm font-medium">
              IMEI
            </label>
            <input id="imei" name="imei" className="feld zahl" inputMode="numeric" />
          </div>

          <div>
            <label htmlFor="iccid" className="mb-1 block text-sm font-medium">
              ICCID (SIM)
            </label>
            <input id="iccid" name="iccid" className="feld zahl" inputMode="numeric" />
          </div>

          <div>
            <label htmlFor="mobilfunkanbieter" className="mb-1 block text-sm font-medium">
              Mobilfunkanbieter
            </label>
            <input id="mobilfunkanbieter" name="mobilfunkanbieter" className="feld" placeholder="z. B. 1NCE" />
          </div>

          <div>
            <label htmlFor="hardware_rev" className="mb-1 block text-sm font-medium">
              Hardwarestand
            </label>
            <input id="hardware_rev" name="hardware_rev" className="feld" placeholder="z. B. v1.0" />
          </div>

          <div>
            <label htmlFor="montage_offset_mm" className="mb-1 block text-sm font-medium">
              Montageversatz (mm)
            </label>
            <input
              id="montage_offset_mm"
              name="montage_offset_mm"
              type="number"
              defaultValue={0}
              className="feld zahl"
            />
            <p className="mt-1 text-xs text-ink-3">Abstand Sensorunterkante zur Deckelinnenseite.</p>
          </div>

          <div>
            <label htmlFor="intervall_minuten" className="mb-1 block text-sm font-medium">
              Sendeintervall (Minuten)
            </label>
            <input
              id="intervall_minuten"
              name="intervall_minuten"
              type="number"
              defaultValue={360}
              className="feld zahl"
            />
            <p className="mt-1 text-xs text-ink-3">360 Minuten = vier Meldungen pro Tag.</p>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="bemerkung" className="mb-1 block text-sm font-medium">
              Bemerkung
            </label>
            <input id="bemerkung" name="bemerkung" className="feld" />
          </div>
        </div>
      </fieldset>

      {ergebnis?.fehler && (
        <p role="alert" className="text-sm" style={{ color: "var(--kritisch)" }}>
          {ergebnis.fehler}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={laeuft} className="knopf-primaer">
          {laeuft ? "Wird angelegt …" : "Gerät anlegen"}
        </button>
        <Link href="/intern/sensoren" className="knopf-sekundaer">
          Abbrechen
        </Link>
      </div>
    </form>
  );
}
