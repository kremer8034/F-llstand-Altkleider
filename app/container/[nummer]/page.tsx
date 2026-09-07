import Link from "next/link";
import { oeffentlicherClient } from "@/lib/supabase/oeffentlich";
import type { OeffentlicherContainer, OeffentlicherStandort } from "@/lib/typen";
import { Containeransicht } from "./Containeransicht";

// Wie die öffentliche Karte: aktuell, aber nicht bei jedem Aufruf frisch.
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ nummer: string }> }) {
  const { nummer } = await params;
  return { title: `Altkleidercontainer ${decodeURIComponent(nummer)}` };
}

export default async function Containerseite({ params }: { params: Promise<{ nummer: string }> }) {
  const { nummer } = await params;
  const gesucht = decodeURIComponent(nummer);
  const supabase = oeffentlicherClient();

  // Beide Listen kommen vollständig vom Server, und sortiert wird erst im
  // Browser. Das ist der Grund, warum die Position des Bürgers das Gerät nie
  // verlässt: es gibt keinen Endpunkt, an den sie zu schicken wäre.
  const [behaelterAntwort, standortAntwort] = supabase
    ? await Promise.all([
        // Nur die Zuordnung Aufkleber -> Platz. Angezeigt wird der Zustand des
        // Platzes; der einzelne Kuebel traegt seit 0022 keine eigene Anschrift
        // und keinen eigenen oeffentlichen Messwert mehr.
        supabase.from("oeffentlicher_container").select("*").order("nummer"),
        supabase.from("oeffentliche_standorte").select("*").order("name"),
      ])
    : [null, null];

  const behaelter = (behaelterAntwort?.data ?? []) as OeffentlicherContainer[];
  const plaetze = (standortAntwort?.data ?? []) as OeffentlicherStandort[];
  const dieser = behaelter.find((c) => c.nummer.toLowerCase() === gesucht.toLowerCase()) ?? null;
  const hier = dieser ? (plaetze.find((p) => p.standort_id === dieser.standort_id) ?? null) : null;

  // Einen Fehler nicht als leere Liste durchreichen.
  //
  // Genau das ist einmal passiert: die Platzansicht lieferte einen
  // Rechtefehler, die Seite machte daraus "In der Nähe ist gerade kein Platz
  // mit freier Kapazität bekannt" - eine Aussage über die Welt, wo in
  // Wahrheit die Abfrage kaputt war. Wer davorsteht, fährt dann heim statt
  // zum nächsten Platz. Ein Fehler muss als Fehler zu sehen sein.
  const listeGestoert = Boolean(standortAntwort?.error);
  if (standortAntwort?.error) {
    console.error("oeffentliche_standorte nicht abrufbar:", standortAntwort.error);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-8">
      <header className="mb-5">
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
        <p className="mt-1 text-sm text-ink-2">Altkleidercontainer</p>
      </header>

      {!supabase ? (
        <div className="karte-flaeche p-6">
          <h1 className="font-semibold">Noch nicht eingerichtet</h1>
          <p className="mt-2 text-sm text-ink-2">
            Diese Instanz ist noch nicht mit einer Datenbank verbunden.
          </p>
        </div>
      ) : (
        <Containeransicht dieser={dieser} hier={hier} plaetze={plaetze} listeGestoert={listeGestoert} />
      )}

      <footer className="mt-8 border-t pt-4 text-sm">
        <Link href="/" className="underline underline-offset-2">
          Alle Abgabestellen auf der Karte
        </Link>
      </footer>
    </main>
  );
}
