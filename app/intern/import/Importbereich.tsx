"use client";

import { useMemo, useState } from "react";
import { csvLesen, schluesselNormalisieren, zahlLesen } from "@/lib/csv";
import { standorteImportieren, type Importergebnis, type Importzeile } from "./aktionen";

/** Erkannte Schreibweisen je Zielfeld - deckt die üblichen Exportspalten ab. */
const SPALTEN: Record<keyof Importzeile, string[]> = {
  name: ["name", "standort", "standortname", "platz", "cluster", "sammelstelle", "bezeichnung"],
  kuerzel: ["kuerzel", "kurz", "kurzzeichen", "praefix", "stamm"],
  strasse: ["strasse", "strassehausnummer", "adresse", "anschrift"],
  plz: ["plz", "postleitzahl"],
  ort: ["ort", "stadt", "gemeinde"],
  lat: ["lat", "latitude", "breitengrad", "geobreite", "ykoordinate"],
  lng: ["lng", "lon", "longitude", "laengengrad", "geolaenge", "xkoordinate"],
  zufahrt: ["zufahrt", "anfahrt", "zugang"],
  bemerkung: ["bemerkung", "hinweis", "notiz", "kommentar"],
  anzahl_container: [
    "anzahl",
    "anzahlcontainer",
    "container",
    "behaelter",
    "anzahlbehaelter",
    "stueck",
  ],
};

function spalteFinden(kopf: string[], feld: keyof Importzeile): number {
  const normalisiert = kopf.map(schluesselNormalisieren);
  for (const kandidat of SPALTEN[feld]) {
    const index = normalisiert.indexOf(kandidat);
    if (index >= 0) return index;
  }
  return -1;
}

/**
 * Standorte einspielen.
 *
 * Bis 0022 wurden hier Container importiert. Seit der Platz die Einheit ist,
 * trägt eine Zeile den Platz – und in einer Spalte die Zahl der Container, die
 * dort stehen. Die Container entstehen daraus samt Nummern; einzeln einlesen
 * lassen sie sich nicht mehr, weil sie nichts Eigenes mehr zu tragen hätten.
 */
export function Importbereich() {
  const [text, setText] = useState("");
  const [ergebnis, setErgebnis] = useState<Importergebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const analyse = useMemo(() => {
    if (!text.trim()) return null;

    const zeilen = csvLesen(text);
    if (zeilen.length < 2)
      return { fehler: "Es braucht eine Kopfzeile und mindestens eine Datenzeile." };

    const kopf = zeilen[0];
    const zuordnung = Object.fromEntries(
      (Object.keys(SPALTEN) as (keyof Importzeile)[]).map((feld) => [feld, spalteFinden(kopf, feld)]),
    ) as Record<keyof Importzeile, number>;

    if (zuordnung.name < 0) {
      return {
        fehler:
          "Keine Spalte mit dem Standortnamen gefunden. Erwartet wird eine Spalte namens „Name“, „Standort“, „Platz“ oder ähnlich.",
        kopf,
      };
    }

    const werte = (zeile: string[], feld: keyof Importzeile): string | undefined => {
      const index = zuordnung[feld];
      return index >= 0 ? zeile[index] : undefined;
    };

    const daten: Importzeile[] = zeilen.slice(1).map((zeile) => ({
      name: (werte(zeile, "name") ?? "").trim(),
      kuerzel: werte(zeile, "kuerzel") || null,
      strasse: werte(zeile, "strasse") || null,
      plz: werte(zeile, "plz") || null,
      ort: werte(zeile, "ort") || null,
      lat: zahlLesen(werte(zeile, "lat")),
      lng: zahlLesen(werte(zeile, "lng")),
      zufahrt: werte(zeile, "zufahrt") || null,
      bemerkung: werte(zeile, "bemerkung") || null,
      anzahl_container: zahlLesen(werte(zeile, "anzahl_container")),
    }));

    const gueltig = daten.filter((d) => d.name !== "");
    const ohneKoordinaten = gueltig.filter((d) => d.lat === null || d.lng === null).length;
    const mitAnzahl = gueltig.filter((d) => d.anzahl_container !== null).length;

    return {
      kopf,
      zuordnung,
      daten: gueltig,
      verworfen: daten.length - gueltig.length,
      ohneKoordinaten,
      mitAnzahl,
    };
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
    setErgebnis(await standorteImportieren(analyse.daten));
    setLaeuft(false);
  }

  return (
    <div className="space-y-4">
      <div className="karte-flaeche p-4">
        <label htmlFor="datei" className="mb-1 block text-sm font-medium">
          CSV-Datei auswählen
        </label>
        <input
          id="datei"
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={dateiLesen}
          className="feld"
        />

        <p className="mt-3 text-xs text-ink-3">
          Oder den Inhalt direkt einfügen – Semikolon, Komma und Tabulator werden erkannt. Eine
          Zeile je Standort; die Spalte <span className="zahl">Anzahl</span> sagt, wie viele
          Container dort stehen.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setErgebnis(null);
          }}
          rows={6}
          placeholder="Name;Kürzel;Strasse;PLZ;Ort;Breitengrad;Längengrad;Anzahl;Zufahrt"
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
              <strong>{analyse.daten.length}</strong> Standorte erkannt
              {analyse.verworfen > 0 && (
                <span className="text-ink-3">
                  {" "}
                  · {analyse.verworfen} Zeilen ohne Namen übersprungen
                </span>
              )}
              {analyse.mitAnzahl > 0 && (
                <span className="text-ink-3"> · {analyse.mitAnzahl} mit Containerzahl</span>
              )}
              {analyse.ohneKoordinaten > 0 && (
                <span className="text-ink-3"> · {analyse.ohneKoordinaten} ohne Koordinaten</span>
              )}
            </div>
            <button type="button" onClick={importieren} disabled={laeuft} className="knopf-primaer">
              {laeuft ? "Wird importiert …" : "Import starten"}
            </button>
          </div>

          {analyse.ohneKoordinaten > 0 && (
            <p className="border-b bg-flaeche-2/40 px-4 py-2 text-xs text-ink-2">
              Standorte ohne Koordinaten erscheinen weder auf der öffentlichen Seite noch in der
              Tourenplanung. Nachtragen lassen sie sich danach auf der Standortseite – dort gibt es
              eine Karte zum Anklicken.
            </p>
          )}

          <div className="max-h-96 overflow-auto">
            <table className="tabelle">
              <thead className="sticky top-0 bg-flaeche">
                <tr>
                  <th>Name</th>
                  <th>Kürzel</th>
                  <th>Adresse</th>
                  <th>Koordinaten</th>
                  <th>Container</th>
                </tr>
              </thead>
              <tbody>
                {analyse.daten.slice(0, 100).map((d, i) => (
                  <tr key={`${d.name}-${i}`}>
                    <td className="font-medium">{d.name}</td>
                    <td className="zahl text-ink-2">{d.kuerzel ?? "–"}</td>
                    <td className="text-ink-2">
                      {[d.strasse, [d.plz, d.ort].filter(Boolean).join(" ")]
                        .filter(Boolean)
                        .join(", ") || "–"}
                    </td>
                    <td className="zahl text-ink-2">
                      {d.lat !== null && d.lng !== null ? `${d.lat}, ${d.lng}` : "–"}
                    </td>
                    <td className="zahl text-ink-2">{d.anzahl_container ?? "–"}</td>
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
              Import abgeschlossen: <strong>{ergebnis.neu}</strong> Standorte neu angelegt,{" "}
              <strong>{ergebnis.aktualisiert}</strong> aktualisiert.
              {(ergebnis.behaelter_angelegt ?? 0) > 0 && (
                <>
                  {" "}
                  <strong>{ergebnis.behaelter_angelegt}</strong> Container angelegt.
                </>
              )}
              {(ergebnis.behaelter_stillgelegt ?? 0) > 0 && (
                <>
                  {" "}
                  <strong>{ergebnis.behaelter_stillgelegt}</strong> stillgelegt (hatten Geschichte).
                </>
              )}
              {(ergebnis.behaelter_geloescht ?? 0) > 0 && (
                <>
                  {" "}
                  <strong>{ergebnis.behaelter_geloescht}</strong> gelöscht (nie benutzt).
                </>
              )}
              {(ergebnis.ohne_koordinaten ?? 0) > 0 && (
                <>
                  {" "}
                  <strong>{ergebnis.ohne_koordinaten}</strong> Standorte haben keine Koordinaten und
                  bleiben damit unsichtbar.
                </>
              )}
            </p>
          ) : (
            <>
              <p style={{ color: "var(--kritisch)" }}>{ergebnis.fehler}</p>
              {/*
                Der Import schreibt Platz für Platz. Bricht er in der Mitte ab,
                ist die erste Hälfte bereits drin - wer das nicht weiß, spielt
                dieselbe Datei noch einmal ein.
              */}
              {ergebnis.abgebrochen_bei !== undefined && (
                <p className="mt-2 text-ink-2">
                  Abgebrochen bei Zeile <strong>{ergebnis.abgebrochen_bei}</strong>. Was davor
                  stand, ist bereits eingespielt: <strong>{ergebnis.neu ?? 0}</strong> Standorte
                  neu, <strong>{ergebnis.aktualisiert ?? 0}</strong> aktualisiert,{" "}
                  <strong>{ergebnis.behaelter_angelegt ?? 0}</strong> Container angelegt. Eine
                  Wiederholung der ganzen Datei ist gefahrlos – abgeglichen wird über den Namen.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
