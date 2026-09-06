"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { GERAETEARTEN, STANDARD_BAUART, geraeteart } from "@/lib/geraetearten";
import { Nfceinstellungen } from "../Nfceinstellungen";
import { sensorAnlegen, type AnlageErgebnis } from "../aktionen";

export function Geraeteaufnahme() {
  const [ergebnis, setErgebnis] = useState<AnlageErgebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [kopiert, setKopiert] = useState(false);
  const [bauart, setBauart] = useState(STANDARD_BAUART);

  const art = useMemo(() => geraeteart(bauart) ?? GERAETEARTEN[0], [bauart]);
  const eigenbau = art.annahme === "eigenbau";

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
          {ergebnis.geheimnis ? (
            <p className="mt-1 text-sm text-ink-2">
              Der Geräteschlüssel wird <strong>nur jetzt</strong> angezeigt. Übernehmen Sie ihn in
              die Firmware, bevor Sie diese Seite verlassen.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-2">
              Weiter mit der NFC-App: Handy an das Gehäuse halten und die Werte unten eintragen.
              Danach den Anlerncode auf den Aufkleber.
            </p>
          )}

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-xs text-ink-3">{eigenbau ? "Geräte-ID" : "Seriennummer"}</dt>
              <dd className="zahl text-lg font-semibold">{ergebnis.geraete_id}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Anlerncode (auf den Aufkleber)</dt>
              <dd className="zahl text-lg font-semibold tracking-widest">{ergebnis.anlerncode}</dd>
            </div>
          </dl>

          {ergebnis.geheimnis && (
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
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/intern/sensoren/anlernen" className="knopf-primaer">
              Jetzt anlernen
            </Link>
            <Link href="/intern/sensoren" className="knopf-sekundaer">
              Zur Sensorliste
            </Link>
            <button type="button" onClick={() => setErgebnis(null)} className="knopf-sekundaer">
              Nächstes Gerät aufnehmen
            </button>
          </div>
        </div>

        {/* Beim Fertiggeraet steht hier der eigentliche naechste Handgriff.
            Die Werte bleiben ueber "Sensoren -> Einstellungen" erreichbar -
            anders als der Geraeteschluessel sind sie kein Einmalgeheimnis. */}
        {ergebnis.nfc && <Nfceinstellungen daten={ergebnis.nfc} />}

        {ergebnis.nfc ? (
          <p className="text-xs text-ink-3">
            Die erste Meldung des Geräts wird auch ohne Anlernen protokolliert – sie taucht nach
            dem Koppeln rückwirkend am Container auf und liefert dort gleich den Leerwert.
          </p>
        ) : (
          <p className="text-xs text-ink-3">
            Alternative ohne Flashen des Schlüssels: die Firmware holt sich beim allerersten Start
            ihr Geheimnis selbst über <span className="zahl">/api/geraete/registrieren</span> ab.
            Das geht pro Gerät genau einmal.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Bauart</legend>

        <div className="space-y-2">
          {GERAETEARTEN.map((g) => (
            <label
              key={g.kennung}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                bauart === g.kennung ? "bg-flaeche-2" : "hover:bg-flaeche-2"
              }`}
            >
              <input
                type="radio"
                name="bauart"
                value={g.kennung}
                checked={bauart === g.kennung}
                onChange={() => setBauart(g.kennung)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{g.name}</span>
                <span className="block text-xs text-ink-3">
                  {g.messprinzip} · {g.mess_min_mm}–{g.mess_max_mm} mm ·{" "}
                  {g.annahme === "eigenbau" ? "eigene Firmware" : "meldet über MQTT"}
                </span>
              </span>
            </label>
          ))}
        </div>

        <p className="mt-3 text-xs text-ink-2">{art.hinweis}</p>
      </fieldset>

      <fieldset className="karte-flaeche p-4">
        <legend className="px-1 text-sm font-semibold">Gerät</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="geraete_id" className="mb-1 block text-sm font-medium">
              {eigenbau ? "Geräte-ID *" : "Seriennummer (SN) *"}
            </label>
            <input
              id="geraete_id"
              name="geraete_id"
              required
              placeholder={eigenbau ? "z. B. ALT-0042" : "z. B. 6746D3486383"}
              className="feld zahl"
            />
            <p className="mt-1 text-xs text-ink-3">
              {eigenbau
                ? "Frei wählbar, muss aber eindeutig sein und außen am Gehäuse stehen."
                : "Steht auf dem Aufkleber am Gehäuse und in der NFC-App. Unter dieser Nummer meldet sich das Gerät."}
            </p>
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
            <p className="mt-1 text-xs text-ink-3">
              Abstand Sensorunterkante zur Deckelinnenseite. 0 lassen, wenn der Sensor direkt unter
              dem Deckel sitzt.
            </p>
          </div>

          <div>
            <label htmlFor="einbauhoehe_mm" className="mb-1 block text-sm font-medium">
              Einbauhöhe (mm)
            </label>
            <input
              id="einbauhoehe_mm"
              name="einbauhoehe_mm"
              type="number"
              min={100}
              max={6000}
              className="feld zahl"
              placeholder="z. B. 1450"
            />
            <p className="mt-1 text-xs text-ink-3">
              Sensorunterkante bis Boden bei leerem Container – daraus entsteht der Leerwert der
              Füllstandsrechnung. Leer lassen ist in Ordnung: nach dem Anlernen lässt sich die Höhe
              aus den ersten Messungen ermitteln.
            </p>
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
            <p className="mt-1 text-xs text-ink-3">
              {eigenbau
                ? "360 Minuten = vier Meldungen pro Tag. Die Firmware holt sich diesen Wert ab."
                : "360 Minuten = vier Meldungen pro Tag. Steht gleich als „Reporting Interval“ in der NFC-Anleitung."}
            </p>
          </div>
        </div>

        {/* Messbereich wird nicht mehr abgefragt: er steht im Datenblatt und
            nicht im Ermessen dessen, der das Gerät aufnimmt. */}
        <p className="mt-4 text-xs text-ink-3">
          Messbereich <span className="zahl">{art.mess_min_mm}–{art.mess_max_mm} mm</span> und
          Annahmeweg ergeben sich aus der Bauart.
          {art.kennung === "milesight_em400_tld" && (
            <>
              {" "}
              <span style={{ color: "var(--ernst)" }}>
                Der EM400-TLD misst nur bis 2 m – ist der Container innen höher, fehlt bei leerem
                Container der Wert für die Kalibrierung. Vorher nachmessen.
              </span>
            </>
          )}
        </p>

        {/* IMEI und ICCID sind Rückfallwege, keine Pflicht: das Gerät meldet
            sich normalerweise mit seiner Seriennummer. Weil es für Sensoren
            keine Bearbeitungsmaske gibt, bleiben sie hier erreichbar - nur
            nicht mehr im Weg. */}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-ink-2">
            Weitere Kennungen (IMEI, ICCID) – nur selten nötig
          </summary>
          <p className="mt-2 text-xs text-ink-3">
            Nur eintragen, wenn das Gerät sich nicht mit seiner Seriennummer meldet. Woran das zu
            erkennen ist: unter <span className="zahl">Sensoren → Einstellungen</span> steht, was in
            den bisherigen Meldungen als Kennung ankam.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
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
          </div>
        </details>
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
