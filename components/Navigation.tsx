"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ROLLEN_TEXT } from "@/lib/rollen";
import type { Benutzerrolle } from "@/lib/typen";

const PUNKTE: { pfad: string; text: string; rollen?: Benutzerrolle[] }[] = [
  { pfad: "/intern", text: "Übersicht" },
  { pfad: "/intern/karte", text: "Karte" },
  { pfad: "/intern/touren", text: "Tour" },
  { pfad: "/intern/container", text: "Container" },
  { pfad: "/intern/sensoren", text: "Sensoren" },
  { pfad: "/intern/import", text: "Import", rollen: ["admin", "dispo"] },
  { pfad: "/intern/benutzer", text: "Benutzer", rollen: ["admin"] },
];

export function Navigation({ name, rolle }: { name: string; rolle: Benutzerrolle }) {
  const pfad = usePathname();
  const [offen, setOffen] = useState(false);
  const sichtbar = PUNKTE.filter((p) => !p.rollen || p.rollen.includes(rolle));

  function istAktiv(ziel: string) {
    return ziel === "/intern" ? pfad === "/intern" : pfad.startsWith(ziel);
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-flaeche">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/intern" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--brk)" }} />
          Füllstand
        </Link>

        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {sichtbar.map((p) => (
            <Link
              key={p.pfad}
              href={p.pfad}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                istAktiv(p.pfad) ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {p.text}
            </Link>
          ))}
        </nav>

        <div className="ml-auto hidden items-center gap-3 md:flex">
          <span className="text-right text-xs leading-tight text-ink-3">
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
