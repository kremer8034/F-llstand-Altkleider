import Link from "next/link";
import { ZEITRAEUME } from "@/lib/zeitraum";

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
 */
export function Zeitraumwahl({
  pfad,
  aktiv,
}: {
  pfad: string;
  aktiv: string;
}) {
  return (
    <div
      className="inline-flex rounded-lg border bg-flaeche p-0.5"
      role="group"
      aria-label="Zeitraum der Verlaufskurven"
    >
      {ZEITRAEUME.map((z) => {
        const gewaehlt = z.schluessel === aktiv;
        return (
          <Link
            key={z.schluessel}
            href={`${pfad}?zeitraum=${z.schluessel}`}
            scroll={false}
            aria-current={gewaehlt ? "true" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              gewaehlt ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {z.text}
          </Link>
        );
      })}
    </div>
  );
}
