"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Treffer {
  anzeige: string;
  lat: number;
  lng: number;
}

/**
 * Koordinaten auf der Karte setzen statt abtippen.
 *
 * Der Ablauf folgt dem, was jemand ohnehin tut: erst die Anschrift eintragen,
 * dann nachsehen, ob der Punkt stimmt. Deshalb sucht die Karte auf Knopfdruck
 * zur eingetippten Adresse und setzt die Nadel dorthin; verschieben lässt sie
 * sich danach frei - die Adresse trifft das Haus, der Container steht aber auf
 * dem Parkplatz dahinter.
 *
 * **Die Zahlenfelder bleiben die Wahrheit.** Die Karte schreibt in sie hinein,
 * ersetzt sie nicht. Wer mit der Tastatur arbeitet oder Koordinaten aus einer
 * anderen Quelle hat, tippt sie weiterhin ein - eine Karte, die das einzige
 * Eingabemittel wäre, würde diese Nutzer aussperren.
 *
 * **Ohne Koordinaten kein öffentlicher Eintrag.** Deshalb steht der Hinweis
 * hier und nicht erst hinterher auf der Standortseite.
 */
export function Kartenwaehler({
  lat: latAnfang,
  lng: lngAnfang,
  /** Felder, aus denen die Adresssuche ihre Anfrage baut. */
  adressFelder = ["strasse", "plz", "ort"],
}: {
  lat: number | null;
  lng: number | null;
  adressFelder?: string[];
}) {
  const [lat, setLat] = useState<string>(latAnfang === null ? "" : String(latAnfang));
  const [lng, setLng] = useState<string>(lngAnfang === null ? "" : String(lngAnfang));
  const [treffer, setTreffer] = useState<Treffer[] | null>(null);
  const [sucht, setSucht] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const behaelter = useRef<HTMLDivElement>(null);
  const karte = useRef<LeafletMap | null>(null);
  const nadel = useRef<Marker | null>(null);
  /** Von der Karte gefüllt, von der Trefferliste benutzt. */
  const setzenRef = useRef<((lat: number, lng: number, zentrieren: boolean) => void) | null>(null);

  const uebernehmen = useCallback((neuLat: number, neuLng: number) => {
    setLat(neuLat.toFixed(6));
    setLng(neuLng.toFixed(6));
  }, []);

  // Mitte des Landkreises Miltenberg, wenn noch nichts gesetzt ist - eine
  // Weltkarte hilft niemandem weiter.
  const zentrum: [number, number] = [
    latAnfang ?? 49.705,
    lngAnfang ?? 9.253,
  ];

  useEffect(() => {
    let abgebrochen = false;

    async function aufbauen() {
      const L = await import("leaflet");
      if (abgebrochen || !behaelter.current || karte.current) return;

      karte.current = L.map(behaelter.current, {
        center: zentrum,
        zoom: latAnfang === null ? 10 : 17,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(karte.current);

      const symbol = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--serie);border:2px solid var(--flaeche);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 18],
      });

      if (latAnfang !== null && lngAnfang !== null) {
        nadel.current = L.marker([latAnfang, lngAnfang], { draggable: true, icon: symbol }).addTo(
          karte.current,
        );
        nadel.current.on("dragend", () => {
          const p = nadel.current?.getLatLng();
          if (p) uebernehmen(p.lat, p.lng);
        });
      }

      // Klick setzt die Nadel - der übliche Handgriff auf jeder Karte.
      karte.current.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        setzeNadel(e.latlng.lat, e.latlng.lng, false);
      });
    }

    async function setzeNadel(neuLat: number, neuLng: number, zentrieren: boolean) {
      const L = await import("leaflet");
      if (!karte.current) return;

      const symbol = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:var(--serie);border:2px solid var(--flaeche);box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 18],
      });

      if (nadel.current) {
        nadel.current.setLatLng([neuLat, neuLng]);
      } else {
        nadel.current = L.marker([neuLat, neuLng], { draggable: true, icon: symbol }).addTo(
          karte.current,
        );
        nadel.current.on("dragend", () => {
          const p = nadel.current?.getLatLng();
          if (p) uebernehmen(p.lat, p.lng);
        });
      }

      if (zentrieren) karte.current.setView([neuLat, neuLng], 17);
      uebernehmen(neuLat, neuLng);
    }

    // Nach außen sichtbar machen, damit die Trefferliste die Nadel setzen kann.
    setzenRef.current = setzeNadel;

    aufbauen();
    return () => {
      abgebrochen = true;
      karte.current?.remove();
      karte.current = null;
      nadel.current = null;
    };
    // Absichtlich nur beim Aufbau: die Karte lebt weiter, die Nadel wandert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uebernehmen]);

  async function suchen() {
    setFehler(null);
    setTreffer(null);

    const formular = behaelter.current?.closest("form");
    const teile = adressFelder
      .map((feld) => (formular?.elements.namedItem(feld) as HTMLInputElement | null)?.value ?? "")
      .filter((w) => w.trim() !== "");

    if (teile.length === 0) {
      setFehler("Bitte zuerst Straße, PLZ oder Ort eintragen.");
      return;
    }

    setSucht(true);
    try {
      const antwort = await fetch(
        `/api/intern/geokodieren?adresse=${encodeURIComponent(teile.join(", "))}`,
      );
      const daten = (await antwort.json()) as { treffer?: Treffer[]; fehler?: string };
      if (!antwort.ok) {
        setFehler(daten.fehler ?? "Die Adresssuche hat nicht geklappt.");
        return;
      }
      if (!daten.treffer || daten.treffer.length === 0) {
        setFehler("Zu dieser Adresse wurde nichts gefunden. Die Nadel lässt sich von Hand setzen.");
        return;
      }
      setTreffer(daten.treffer);
      const erster = daten.treffer[0];
      setzenRef.current?.(erster.lat, erster.lng, true);
    } catch {
      setFehler("Die Adresssuche war nicht erreichbar.");
    } finally {
      setSucht(false);
    }
  }

  const fehltNoch = lat.trim() === "" || lng.trim() === "";

  return (
    <div className="sm:col-span-2">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={suchen} disabled={sucht} className="knopf-sekundaer">
          {sucht ? "Suche läuft …" : "Adresse auf der Karte suchen"}
        </button>
        <span className="text-xs text-ink-3">
          Danach die Nadel anklicken oder ziehen – der Behälter steht selten genau an der Hausnummer.
        </span>
      </div>

      {fehler && (
        <p className="mb-2 text-sm" style={{ color: "var(--ernst)" }}>
          {fehler}
        </p>
      )}

      {treffer && treffer.length > 1 && (
        <ul className="mb-2 divide-y rounded-lg border text-sm">
          {treffer.map((t, i) => (
            <li key={`${t.lat},${t.lng}`}>
              <button
                type="button"
                onClick={() => setzenRef.current?.(t.lat, t.lng, true)}
                className="w-full px-3 py-2 text-left hover:bg-flaeche-2"
              >
                {t.anzeige}
                {i === 0 && <span className="ml-2 text-xs text-ink-3">übernommen</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div ref={behaelter} className="karte-flaeche h-[320px] overflow-hidden" />

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="lat" className="mb-1 block text-sm font-medium">
            Breitengrad
          </label>
          <input
            id="lat"
            name="lat"
            type="number"
            step="0.000001"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
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
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            className="feld zahl"
            placeholder="9.253"
          />
        </div>
      </div>

      {fehltNoch && (
        <p className="mt-2 text-sm text-ink-2">
          <strong>Ohne Koordinaten fehlt dieser Platz auf der öffentlichen Seite</strong> – samt
          aller Behälter, die hier stehen. Auch die Tourenplanung kann ihn nicht anfahren.
        </p>
      )}
    </div>
  );
}
