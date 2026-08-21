"use client";

import { useMemo, useState } from "react";
import { csvLesen, datumLesen, schluesselNormalisieren, zahlLesen } from "@/lib/csv";
import { containerImportieren, type Importergebnis, type Importzeile } from "./aktionen";

/** Erkannte Schreibweisen je Zielfeld - deckt die üblichen Exportspalten ab. */
const SPALTEN: Record<keyof Importzeile, string[]> = {
  nummer: ["nummer", "containernummer", "containernr", "nr", "kennung", "bezeichnungnr"],
  externe_id: ["id", "externeid", "datensatzid", "objektid", "dlkid"],
  bezeichnung: ["bezeichnung", "standort", "standortbezeichnung", "name", "beschreibung"],
  strasse: ["strasse", "strassehausnummer", "adresse", "anschrift"],
  plz: ["plz", "postleitzahl"],
  ort: ["ort", "stadt", "gemeinde"],
  lat: ["lat", "latitude", "breitengrad", "geobreite", "ykoordinate"],
  lng: ["lng", "lon", "longitude", "laengengrad", "geolaenge", "xkoordinate"],
  typ: ["typ", "art", "containertyp"],
  volumen_liter: ["volumen", "volumenliter", "groesse", "fassungsvermoegen"],
  aufstelldatum: ["aufstelldatum", "aufstellung", "seit", "aufgestelltam", "datum"],
  bemerkung: ["bemerkung", "hinweis", "notiz", "kommentar"],
};

function spalteFinden(kopf: string[], feld: keyof Importzeile): number {
  const normalisiert = kopf.map(schluesselNormalisieren);
  for (const kandidat of SPALTEN[feld]) {
    const index = normalisiert.indexOf(kandidat);
    if (index >= 0) return index;
  }
  return -1;
}

export function Importbereich() {
  const [text, setText] = useState("");
  const [ergebnis, setErgebnis] = useState<Importergebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const analyse = useMemo(() => {
    if (!text.trim()) return null;

    const zeilen = csvLesen(text);
    if (zeilen.length < 2) return { fehler: "Es braucht eine Kopfzeile und mindestens eine Datenzeile." };

    const kopf = zeilen[0];
    const zuordnung = Object.fromEntries(
      (Object.keys(SPALTEN) as (keyof Importzeile)[]).map((feld) => [feld, spalteFinden(kopf, feld)]),
    ) as Record<keyof Importzeile, number>;

    if (zuordnung.nummer < 0) {
      return {
        fehler:
          "Keine Spalte mit der Containernummer gefunden. Erwartet wird eine Spalte namens „Nummer“, „Containernummer“ oder ähnlich.",
        kopf,
      };
    }

    const werte = (zeile: string[], feld: keyof Importzeile): string | undefined => {
      const index = zuordnung[feld];
      return index >= 0 ? zeile[index] : undefined;
    };

    const daten: Importzeile[] = zeilen.slice(1).map((zeile) => ({
      nummer: (werte(zeile, "nummer") ?? "").trim(),
      externe_id: werte(zeile, "externe_id") || null,
      bezeichnung: werte(zeile, "bezeichnung") || null,
      strasse: werte(zeile, "strasse") || null,
      plz: werte(zeile, "plz") || null,
      ort: werte(zeile, "ort") || null,
      lat: zahlLesen(werte(zeile, "lat")),
      lng: zahlLesen(werte(zeile, "lng")),
      typ: werte(zeile, "typ") || null,
      volumen_liter: zahlLesen(werte(zeile, "volumen_liter")),
      aufstelldatum: datumLesen(werte(zeile, "aufstelldatum")),
      bemerkung: werte(zeile, "bemerkung") || null,
    }));

    const gueltig = daten.filter((d) => d.nummer !== "");
    const ohneKoordinaten = gueltig.filter((d) => d.lat === null || d.lng === null).length;

    return { kopf, zuordnung, daten: gueltig, verworfen: daten.length - gueltig.length, ohneKoordinaten };
  }, [text]);

  async function dateiLesen(ereignis: React.ChangeEvent<HTMLInputElement>) {
    const datei = ereignis.target.files?.[0];
    if (!datei) return;
    setText(await datei.text());
    setErgebnis(null);
  }

  async function importieren() {
    if (!analyse || !("daten" in analyse) || !analyse.daten) return;
    setLaeuft(true);
    setErgebnis(await containerImportieren(analyse.daten));
    setLaeuft(false);
  }

  return (
    <div className="space-y-4">
      <div className="karte-flaeche p-4">
        <label htmlFor="datei" className="mb-1 block text-sm font-medium">
          CSV-Datei auswählen
        </label>
        <input id="datei" type="file" accept=".csv,text/csv,text/plain" onChange={dateiLesen} className="feld" />

        <p className="mt-3 text-xs text-ink-3">
          Oder den Inhalt direkt einfügen – Semikolon, Komma und Tabulator werden erkannt.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErgebnis(null);
          }}
          rows={6}
          placeholder="Nummer;Bezeichnung;Strasse;PLZ;Ort;Breitengrad;Längengrad;Volumen;Aufstelldatum"
          className="feld zahl mt-2 text-xs"
        />
      </div>

      {analyse && "fehler" in analyse && analyse.fehler && (
        <div className="karte-flaeche p-4 text-sm">
          <p style={{ color: "var(--kritisch)" }}>{analyse.fehler}</p>
          {"kopf" in analyse && analyse.kopf && (
            <p className="mt-2 text-xs text-ink-3">Gefundene Spalten: {analyse.kopf.join(" · ")}</p>
          )}
        </div>
      )}

      {analyse && "daten" in analyse && analyse.daten && (
        <div className="karte-flaeche overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="text-sm">
              <strong>{analyse.daten.length}</strong> Container erkannt
              {analyse.verworfen > 0 && (
                <span className="text-ink-3"> · {analyse.verworfen} Zeilen ohne Nummer übersprungen</span>
              )}
              {analyse.ohneKoordinaten > 0 && (
                <span className="text-ink-3"> · {analyse.ohneKoordinaten} ohne Koordinaten</span>
              )}
            </div>
            <button type="button" onClick={importieren} disabled={laeuft} className="knopf-primaer">
              {laeuft ? "Wird importiert …" : "Import starten"}
            </button>
          </div>

          <div className="max-h-96 overflow-auto">
            <table className="tabelle">
              <thead className="sticky top-0 bg-flaeche">
                <tr>
                  <th>Nummer</th>
                  <th>Bezeichnung</th>
                  <th>Adresse</th>
                  <th>Koordinaten</th>
                  <th>Aufgestellt</th>
                </tr>
              </thead>
              <tbody>
                {analyse.daten.slice(0, 100).map((d, i) => (
                  <tr key={`${d.nummer}-${i}`}>
                    <td className="zahl font-medium">{d.nummer}</td>
                    <td>{d.bezeichnung ?? "–"}</td>
                    <td className="text-ink-2">
                      {[d.strasse, [d.plz, d.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "–"}
                    </td>
                    <td className="zahl text-ink-2">
                      {d.lat !== null && d.lng !== null ? `${d.lat}, ${d.lng}` : "–"}
                    </td>
                    <td className="zahl text-ink-2">{d.aufstelldatum ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analyse.daten.length > 100 && (
              <p className="px-4 py-2 text-xs text-ink-3">
                Vorschau auf die ersten 100 Zeilen – importiert werden alle {analyse.daten.length}.
              </p>
            )}
          </div>
        </div>
      )}

      {ergebnis && (
        <div className="karte-flaeche p-4 text-sm">
          {ergebnis.ok ? (
            <p>
              Import abgeschlossen: <strong>{ergebnis.neu}</strong> neu angelegt,{" "}
              <strong>{ergebnis.aktualisiert}</strong> aktualisiert.
            </p>
          ) : (
            <p style={{ color: "var(--kritisch)" }}>{ergebnis.fehler}</p>
          )}
        </div>
      )}
    </div>
  );
}
