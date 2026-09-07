"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROLLEN_TEXT } from "@/lib/rollen";
import type { Benutzerrolle } from "@/lib/typen";

/**
 * „Container" ist kein eigener Punkt mehr: die Containerliste ist eine
 * Ansicht der Standortseite. Zwei gleichrangige Einträge für dieselbe Sache
 * waren die Ursache der Verwirrung - geplant, angefahren und geleert wird
 * der Standort, also führt er.
 *
 * Der Import steckt jetzt als Knopf auf der Standortseite; er ist ein
 * Handgriff an den Stammdaten, kein eigener Bereich.
 */
interface Punkt {
  pfad: string;
  text: string;
  rollen?: Benutzerrolle[];
}

/**
 * Die taegliche Arbeit. Sieben Punkte, die jemand im Laufe eines Diensts
 * mehrmals anfaesst.
 */
const PUNKTE: Punkt[] = [
  { pfad: "/intern", text: "Übersicht" },
  { pfad: "/intern/karte", text: "Karte" },
  { pfad: "/intern/touren", text: "Touren" },
  { pfad: "/intern/routen", text: "Regeltouren", rollen: ["admin", "dispo"] },
  { pfad: "/intern/standorte", text: "Standorte" },
  { pfad: "/intern/sensoren", text: "Sensoren" },
  { pfad: "/intern/auswertung", text: "Auswertung" },
];

/**
 * Stammdaten. Bauhoefe, Bereitschaften und Benutzer richtet man einmal ein und
 * fasst sie danach selten an - als gleichrangige Punkte in derselben Reihe
 * haben sie die Leiste bei 1280 px zum Ueberlaufen gebracht, so dass
 * "Benutzer" hinter dem rechten Rand verschwand. Und sie sind eine andere
 * Sorte Aufgabe: nicht "wo stehe ich heute", sondern "wie ist die Anlage
 * eingerichtet".
 */
const VERWALTUNG: Punkt[] = [
  { pfad: "/intern/entsorger", text: "Bauhöfe", rollen: ["admin", "dispo"] },
  { pfad: "/intern/gruppen", text: "Bereitschaften", rollen: ["admin"] },
  { pfad: "/intern/benutzer", text: "Benutzer", rollen: ["admin"] },
];

export function Navigation({ name, rolle }: { name: string; rolle: Benutzerrolle }) {
  const pfad = usePathname();
  const [offen, setOffen] = useState(false);
  const [verwaltungOffen, setVerwaltungOffen] = useState(false);
  const sichtbar = PUNKTE.filter((p) => !p.rollen || p.rollen.includes(rolle));
  const verwaltung = VERWALTUNG.filter((p) => !p.rollen || p.rollen.includes(rolle));
  const verwaltungAktiv = verwaltung.some((p) => istAktiv(p.pfad));

  function istAktiv(ziel: string) {
    if (ziel === "/intern") return pfad === "/intern";
    // Die Containerdetailseiten gehören zur Standortansicht - sonst wäre auf
    // ihnen kein Menüpunkt hervorgehoben.
    if (ziel === "/intern/standorte" && pfad.startsWith("/intern/container")) return true;
    return pfad.startsWith(ziel);
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-flaeche">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/intern" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--brk)" }} />
          Füllstand
        </Link>

        {/* Die Punkte brechen nicht mehr um: ein halb umgebrochener Menuepunkt
            schob bisher die ganze Kopfleiste auf. */}
        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
          {sichtbar.map((p) => (
            <Link
              key={p.pfad}
              href={p.pfad}
              className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                istAktiv(p.pfad) ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {p.text}
            </Link>
          ))}

          {verwaltung.length > 0 && (
            <div
              className="relative"
              onMouseLeave={() => setVerwaltungOffen(false)}
            >
              <button
                type="button"
                onClick={() => setVerwaltungOffen((o) => !o)}
                aria-expanded={verwaltungOffen}
                aria-haspopup="true"
                className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                  verwaltungAktiv || verwaltungOffen
                    ? "bg-flaeche-2 text-ink"
                    : "text-ink-2 hover:text-ink"
                }`}
              >
                Verwaltung
              </button>

              {verwaltungOffen && (
                <div className="absolute left-0 top-full z-40 mt-1 min-w-[12rem] rounded-lg border bg-flaeche p-1 shadow-lg">
                  {verwaltung.map((p) => (
                    <Link
                      key={p.pfad}
                      href={p.pfad}
                      onClick={() => setVerwaltungOffen(false)}
                      className={`block whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                        istAktiv(p.pfad) ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      {p.text}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="ml-auto hidden shrink-0 items-center gap-3 md:flex">
          {/* "Meine Tour" ist die Fahreransicht und damit ein anderes Publikum
              als die zehn Punkte der Disposition. Als elfter Eintrag in
              derselben Reihe lief die Leiste bei 1280 px um 63 px ueber und
              schnitt "Benutzer" ab. Hier steht sie bei der Person, zu der sie
              gehoert - und die Reihe passt wieder. */}
          <Link
            href="/fahrer"
            className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
              istAktiv("/fahrer") ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            Meine Tour
          </Link>
          <span className="hidden whitespace-nowrap text-right text-xs leading-tight text-ink-3 lg:block">
            {name}
            <br />
            {ROLLEN_TEXT[rolle]}
          </span>
          <form action="/auth/abmelden" method="post">
            <button type="submit" className="knopf-sekundaer px-3 py-1.5">
              Abmelden
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => setOffen((o) => !o)}
          className="knopf-sekundaer ml-auto px-3 py-1.5 md:hidden"
          aria-expanded={offen}
          aria-label="Menü"
        >
          Menü
        </button>
      </div>

      {offen && (
        <nav className="border-t px-4 py-2 md:hidden">
          <Link
            href="/fahrer"
            onClick={() => setOffen(false)}
            className={`block rounded-md px-3 py-2 text-sm font-medium ${
              istAktiv("/fahrer") ? "bg-flaeche-2 text-ink" : "text-ink-2"
            }`}
          >
            Meine Tour
          </Link>
          {sichtbar.map((p) => (
            <Link
              key={p.pfad}
              href={p.pfad}
              onClick={() => setOffen(false)}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${
                istAktiv(p.pfad) ? "bg-flaeche-2 text-ink" : "text-ink-2"
              }`}
            >
              {p.text}
            </Link>
          ))}

          {verwaltung.length > 0 && (
            <div className="mt-1 border-t pt-1">
              <p className="px-3 py-1 text-xs text-ink-3">Verwaltung</p>
              {verwaltung.map((p) => (
                <Link
                  key={p.pfad}
                  href={p.pfad}
                  onClick={() => setOffen(false)}
                  className={`block rounded-md px-3 py-2 text-sm font-medium ${
                    istAktiv(p.pfad) ? "bg-flaeche-2 text-ink" : "text-ink-2"
                  }`}
                >
                  {p.text}
                </Link>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <span className="text-xs text-ink-3">
              {name} · {ROLLEN_TEXT[rolle]}
            </span>
            <form action="/auth/abmelden" method="post">
              <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                Abmelden
              </button>
            </form>
          </div>
        </nav>
      )}
    </header>
  );
}
