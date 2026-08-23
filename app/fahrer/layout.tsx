import Link from "next/link";
import { rolleErzwingen } from "@/lib/auth";

/**
 * Die Fahreransicht ist kein Ausschnitt des internen Bereichs, sondern eine
 * eigene Oberfläche.
 *
 * Sie wird einhändig bedient, im Stehen, neben einem laufenden Fahrzeug,
 * oft mit Handschuhen und bei Sonne auf dem Display. Deshalb keine
 * Navigationsleiste mit zehn Punkten: auf jedem Bildschirm steht genau das,
 * was jetzt zu tun ist, und der nächste Schritt ist der größte Knopf.
 *
 * Zugang haben auch Disposition und Verwaltung – wer plant, muss sehen können,
 * was das Fahrpersonal sieht, sonst lässt sich kein Fehler nachvollziehen.
 */
export default async function FahrerLayout({ children }: { children: React.ReactNode }) {
  const benutzer = await rolleErzwingen();

  return (
    <div className="min-h-dvh bg-plane">
      <header className="sticky top-0 z-30 border-b bg-flaeche">
        <div className="mx-auto flex w-full max-w-xl items-center gap-3 px-4 py-3">
          <Link href="/fahrer" className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: "var(--brk)" }} />
            Tour
          </Link>
          <span className="ml-auto truncate text-xs text-ink-3">{benutzer.profil.name}</span>
          <form action="/auth/abmelden" method="post">
            <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-4">{children}</main>
    </div>
  );
}
