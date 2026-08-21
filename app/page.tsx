import { oeffentlicherClient } from "@/lib/supabase/oeffentlich";
import type { OeffentlicherContainer } from "@/lib/typen";
import { OeffentlicheAnsicht } from "./OeffentlicheAnsicht";

// Die oeffentliche Karte soll aktuell sein, aber nicht bei jedem Aufruf die
// Datenbank belasten: eine Minute Zwischenspeicher ist ein guter Kompromiss.
export const revalidate = 60;

export default async function Startseite() {
  const supabase = oeffentlicherClient();

  const antwort = supabase
    ? await supabase
        .from("oeffentliche_container")
        .select("*")
        .order("ort", { ascending: true })
        .order("nummer", { ascending: true })
    : null;

  const container = (antwort?.data ?? []) as OeffentlicherContainer[];
  const error = antwort?.error ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          BRK Kreisverband Miltenberg
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Altkleidercontainer – Füllstände</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Die Container melden ihren Füllstand selbst. So sehen Sie vor der Fahrt, welcher Container
          noch Platz hat. Die Angaben sind Messwerte der letzten Übertragung – keine Garantie.
        </p>
      </header>

      {!supabase ? (
        <div className="karte-flaeche p-6">
          <h2 className="font-semibold">Noch nicht eingerichtet</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Diese Instanz ist noch nicht mit einer Datenbank verbunden. Es fehlen die
            Umgebungsvariablen <span className="zahl">NEXT_PUBLIC_SUPABASE_URL</span> und{" "}
            <span className="zahl">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>.
          </p>
          <p className="mt-2 text-sm text-ink-3">
            Die Einrichtung ist in <span className="zahl">docs/betrieb.md</span> beschrieben, der
            Betrieb im eigenen Haus in <span className="zahl">docs/docker.md</span>.
          </p>
        </div>
      ) : (
        <>
          {error && (
            <div className="karte-flaeche mb-6 p-4 text-sm text-ink-2">
              Die Containerdaten sind gerade nicht abrufbar. Bitte versuchen Sie es später erneut.
            </div>
          )}

          <OeffentlicheAnsicht container={container} />
        </>
      )}

      <footer className="mt-10 border-t pt-4 text-xs text-ink-3">
        <p>
          Kartendaten © OpenStreetMap-Mitwirkende. Angaben ohne Gewähr.{" "}
          <a href="/login" className="underline underline-offset-2 hover:text-ink-2">
            Interner Bereich
          </a>
        </p>
      </footer>
    </main>
  );
}
