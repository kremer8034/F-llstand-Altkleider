import Link from "next/link";
import { ZEITRAEUME, ZEITRAUM_EIGEN, alsTagesfeld, type Zeitraum } from "@/lib/zeitraum";

/**
 * Zeitraum fuer die Verlaufskurven. Eine Reihe oberhalb beider Kurven, nicht
 * eine je Kurve: Fuellstand und Batterie stehen untereinander und werden
 * miteinander gelesen ("die Batterie faellt seit der Leerung schneller"), und
 * das geht nur, wenn beide dieselbe Zeitachse haben.
 *
 * Bewusst Links und keine Schalter: der Zeitraum steht damit in der Adresse,
 * ueberlebt das Neuladen und laesst sich verschicken. Die Auswahl holt die
 * Daten neu, deshalb kommen die Punkte fuer ein Jahr auch wirklich aus einem
 * Jahr - ein Umschalter im Browser koennte nur zeigen, was ohnehin schon da
 * ist.
 *
 * Das eigene Fenster folgt derselben Regel: ein <details> mit einem
 * gewoehnlichen GET-Formular. Es braucht kein JavaScript, es landet in
 * derselben Adresse wie die Vorauswahlen, und es steht in einer eigenen
 * Klappe statt dauerhaft in der Zeile - zwei Datumsfelder neben sechs
 * Knoepfen waeren die breiteste Zeile der Seite fuer den seltensten Fall.
 */
export function Zeitraumwahl({ pfad, zeitraum }: { pfad: string; zeitraum: Zeitraum }) {
  // Vorbelegung der Felder: der Zeitraum, der gerade zu sehen ist. Wer die
  // Klappe aufmacht, faengt damit nicht bei leeren Feldern an, sondern
  // verschiebt das Fenster, das er schon vor sich hat.
  const vonFeld = alsTagesfeld(zeitraum.von);
  const bisFeld = alsTagesfeld(zeitraum.bis);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className="inline-flex rounded-lg border bg-flaeche p-0.5"
        role="group"
        aria-label="Zeitraum der Verlaufskurven"
      >
        {ZEITRAEUME.map((z) => {
          const gewaehlt = !zeitraum.eigen && z.schluessel === zeitraum.schluessel;
          return (
            <Link
              key={z.schluessel}
              href={`${pfad}?zeitraum=${z.schluessel}`}
              scroll={false}
              aria-current={gewaehlt ? "true" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                gewaehlt ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
              }`}
            >
              {z.text}
            </Link>
          );
        })}
      </div>

      <details open={zeitraum.eigen} className="relative">
        <summary
          className={`cursor-pointer list-none rounded-lg border px-2.5 py-1.5 text-sm font-medium marker:content-none ${
            zeitraum.eigen ? "bg-flaeche-2 text-ink" : "bg-flaeche text-ink-2 hover:text-ink"
          }`}
          aria-current={zeitraum.eigen ? "true" : undefined}
        >
          {zeitraum.eigen ? zeitraum.text : "Eigener Zeitraum"}
        </summary>

        <form
          method="get"
          action={pfad}
          className="karte-flaeche absolute right-0 top-full z-20 mt-1 w-64 space-y-3 p-3 shadow-lg"
        >
          <input type="hidden" name="zeitraum" value={ZEITRAUM_EIGEN} />
          <div>
            <label htmlFor="zeitraum-von" className="mb-1 block text-xs text-ink-3">
              Von
            </label>
            <input
              id="zeitraum-von"
              name="von"
              type="date"
              required
              defaultValue={vonFeld}
              className="feld zahl"
            />
          </div>
          <div>
            <label htmlFor="zeitraum-bis" className="mb-1 block text-xs text-ink-3">
              Bis
            </label>
            <input
              id="zeitraum-bis"
              name="bis"
              type="date"
              required
              defaultValue={bisFeld}
              className="feld zahl"
            />
          </div>
          {/* Beide Tage zaehlen ganz mit - sonst waere "vom 1. bis zum 1."
              ein leerer Zeitraum, und genau so fragt niemand. */}
          <p className="text-xs leading-relaxed text-ink-3">
            Beide Tage gehören dazu, jeweils von 00:00 bis 24:00 Uhr.
          </p>
          <button type="submit" className="knopf-primaer w-full">
            Anzeigen
          </button>
        </form>
      </details>
    </div>
  );
}
