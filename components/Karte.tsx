"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { STUFEN, adresse, alterText, prozentText, standzeitText, stufeVon } from "@/lib/fuellstand";
import type { Fuellstandsstufe } from "@/lib/typen";

export interface Kartenpunkt {
  id: string;
  nummer: string;
  bezeichnung?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  lat: number;
  lng: number;
  fuellstand_prozent: number | null;
  gemessen_am: string | null;
  standtage?: number | null;
  aufstelldatum?: string | null;
  /** Ziel beim Klick auf "Details" im Popup - nur im internen Bereich gesetzt. */
  detailPfad?: string | null;
}

/** SVG-Nadel: Statusfarbe traegt den Zustand, die Form wiederholt ihn. */
function nadelHtml(stufe: Fuellstandsstufe): string {
  const farbe = STUFEN[stufe].farbe;
  const glyph =
    stufe === "frei"
      ? '<circle cx="14" cy="13" r="4.5" fill="none" stroke="#fff" stroke-width="2"/>'
      : stufe === "teilweise"
        ? '<circle cx="14" cy="13" r="4.5" fill="none" stroke="#fff" stroke-width="2"/><path d="M14 8.5a4.5 4.5 0 0 1 0 9z" fill="#fff"/>'
        : stufe === "hoch"
          ? '<path d="M14 8 19 17H9z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>'
          : stufe === "voll"
            ? '<path d="M14 8 19 17H9z" fill="#fff"/><path d="M14 11.4v2.4" stroke="' +
              farbe +
              '" stroke-width="1.6" stroke-linecap="round"/><circle cx="14" cy="15.4" r=".9" fill="' +
              farbe +
              '"/>'
            : '<circle cx="14" cy="13" r="4.5" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2.4 2.2"/>';

  return `
    <svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 37C14 37 26 23.2 26 13.6A12 12 0 0 0 2 13.6C2 23.2 14 37 14 37Z"
            fill="${farbe}" stroke="var(--flaeche)" stroke-width="2"/>
      ${glyph}
    </svg>`;
}

function popupHtml(p: Kartenpunkt): string {
  const stufe = stufeVon(p.fuellstand_prozent);
  const ort = adresse(p);
  const detail = p.detailPfad
    ? `<a href="${p.detailPfad}" style="display:inline-block;margin-top:8px;font-weight:600;color:var(--serie)">Details ansehen</a>`
    : "";
  const standzeit =
    p.standtage !== null && p.standtage !== undefined
      ? `<div style="color:var(--ink-3)">Standort seit ${standzeitText(p.standtage)}</div>`
      : "";

  return `
    <div style="min-width:200px">
      <div style="font-weight:600;font-size:14px">${p.bezeichnung ?? p.nummer}</div>
      ${ort ? `<div style="color:var(--ink-2);font-size:13px">${ort}</div>` : ""}
      <div style="margin:8px 0;display:flex;align-items:center;gap:8px">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${STUFEN[stufe].farbe}"></span>
        <strong style="font-size:13px">${STUFEN[stufe].text}</strong>
        <span style="font-size:13px;color:var(--ink-2)">${prozentText(p.fuellstand_prozent)}</span>
      </div>
      <div style="font-size:12px;color:var(--ink-3)">Stand: ${alterText(p.gemessen_am)}</div>
      <div style="font-size:12px">${standzeit}</div>
      <div style="font-size:12px;color:var(--ink-3)">Nr. ${p.nummer}</div>
      ${detail}
    </div>`;
}

export default function Karte({
  punkte,
  zentrum = [49.705, 9.253],
  zoom = 11,
  hoehe = "100%",
  className = "",
}: {
  punkte: Kartenpunkt[];
  zentrum?: [number, number];
  zoom?: number;
  hoehe?: string | number;
  className?: string;
}) {
  const behaelter = useRef<HTMLDivElement>(null);
  const karte = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker[]>([]);

  useEffect(() => {
    let abgebrochen = false;

    async function aufbauen() {
      const L = await import("leaflet");
      if (abgebrochen || !behaelter.current || karte.current) return;

      karte.current = L.map(behaelter.current, {
        center: zentrum,
        zoom,
        scrollWheelZoom: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(karte.current);
    }

    aufbauen();

    return () => {
      abgebrochen = true;
      karte.current?.remove();
      karte.current = null;
      marker.current = [];
    };
    // Zentrum/Zoom sind nur der Startausschnitt - bewusst nur einmal anwenden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let abgebrochen = false;

    async function zeichnen() {
      const L = await import("leaflet");
      if (abgebrochen || !karte.current) return;

      marker.current.forEach((m) => m.remove());
      marker.current = [];

      punkte.forEach((p) => {
        const symbol = L.divIcon({
          className: "container-marker",
          html: nadelHtml(stufeVon(p.fuellstand_prozent)),
          iconSize: [28, 38],
          iconAnchor: [14, 37],
          popupAnchor: [0, -32],
        });

        const m = L.marker([p.lat, p.lng], { icon: symbol, title: p.bezeichnung ?? p.nummer })
          .addTo(karte.current!)
          .bindPopup(popupHtml(p));

        marker.current.push(m);
      });

      if (punkte.length > 1) {
        const grenzen = L.latLngBounds(punkte.map((p) => [p.lat, p.lng] as [number, number]));
        karte.current.fitBounds(grenzen, { padding: [40, 40], maxZoom: 14 });
      } else if (punkte.length === 1) {
        karte.current.setView([punkte[0].lat, punkte[0].lng], 15);
      }
    }

    // Kurze Verzoegerung: erst aufbauen, dann zeichnen
    const t = setTimeout(zeichnen, 0);
    return () => {
      abgebrochen = true;
      clearTimeout(t);
    };
  }, [punkte]);

  return <div ref={behaelter} className={className} style={{ height: hoehe, width: "100%" }} />;
}

/** Legende - gehoert immer neben die Karte, damit Farbe nie allein steht. */
export function Kartenlegende({ className = "" }: { className?: string }) {
  const stufen: Fuellstandsstufe[] = ["frei", "teilweise", "hoch", "voll", "unbekannt"];
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${className}`}>
      {stufen.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: STUFEN[s].farbe }}
            aria-hidden
          />
          <span className="text-ink-2">{STUFEN[s].text}</span>
        </span>
      ))}
    </div>
  );
}
