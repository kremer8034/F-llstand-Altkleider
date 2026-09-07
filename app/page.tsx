import { oeffentlicherClient } from "@/lib/supabase/oeffentlich";
import type { OeffentlicherStandort } from "@/lib/typen";
import { OeffentlicheAnsicht } from "./OeffentlicheAnsicht";

// Die oeffentliche Karte soll aktuell sein, aber nicht bei jedem Aufruf die
// Datenbank belasten: eine Minute Zwischenspeicher ist ein guter Kompromiss.
export const revalidate = 60;

export default async function Startseite() {
  const supabase = oeffentlicherClient();

  // Ein Eintrag je Platz, nicht je Container. Wer eine Tuete wegbringen will,
  // faehrt zu einer Adresse - stehen dort sechs Container, ist das trotzdem
  // eine Anlaufstelle und keine sechs. Die Unterscheidung Container/Standort
  // ist eine interne Ordnung; nach draussen wuerde sie nur verwirren.
  const antwort = supabase
    ? await supabase
        .from("oeffentliche_standorte")
        .select("*")
        .order("ort", { ascending: true })
        .order("name", { ascending: true })
    : null;

  const plaetze = (antwort?.data ?? []) as OeffentlicherStandort[];
  const error = antwort?.error ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <header className="mb-6">
        {/* Die Marke traegt jetzt sichtbar, statt als gesperrte Versalzeile
            ueber der Ueberschrift zu stehen. Das Rot des Kreisverbands ist in
            der ganzen Oberflaeche sonst nirgends Handlungsfarbe - hier darf
            es fuehren. */}
        <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm"
            style={{ background: "var(--brk)" }}
          />
          BRK Kreisverband Miltenberg
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">Altkleider – wo ist noch Platz?</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Die Container melden ihren Füllstand selbst. So sehen Sie vor der Fahrt, welche
          Abgabestelle noch aufnimmt. Die Angaben sind Messwerte der letzten Übertragung – keine
          Garantie.
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
              Die Daten sind gerade nicht abrufbar. Bitte versuchen Sie es später erneut.
            </div>
          )}

          <OeffentlicheAnsicht plaetze={plaetze} />
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
