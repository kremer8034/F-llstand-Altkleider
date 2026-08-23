import {
  GRUNDLAGE_TEXT,
  hatPrognose,
  jahresText,
  prognoseDatum,
  prognoseFehlt,
  rateText,
  rhythmusGuete,
  rhythmusText,
  tageText,
} from "@/lib/prognose";
import { alterText } from "@/lib/fuellstand";
import type { ContainerPrognose, ContainerRhythmus } from "@/lib/typen";

/**
 * Prognose und Leerungsrhythmus eines Containers.
 *
 * Die grosse Zahl ist bewusst die Tourenschwelle, nicht die Vollschwelle:
 * danach wird geplant. Wann er randvoll waere, steht daneben - das ist die
 * Zahl, die man wissen will, wenn eine Fahrt verschoben werden muss.
 */
export function Prognosekarte({
  prognose,
  rhythmus,
  schwelleTour,
  schwelleVoll,
}: {
  prognose: ContainerPrognose | null;
  rhythmus: ContainerRhythmus | null;
  schwelleTour: number;
  schwelleVoll: number;
}) {
  const zeigen = hatPrognose(prognose);
  const guete = rhythmus ? rhythmusGuete(rhythmus) : null;

  return (
    <section className="karte-flaeche p-4">
      <h2 className="text-sm font-semibold text-ink-2">Nächste Leerung</h2>

      {zeigen && prognose ? (
        <>
          <p className="mt-2 text-2xl font-semibold leading-tight">{tageText(prognose.tage_bis_tour)}</p>
          <p className="mt-0.5 text-sm text-ink-2">
            fällig ab {schwelleTour} % – voraussichtlich{" "}
            <span className="zahl">{prognoseDatum(prognose.prognose_tour_am)}</span>
          </p>

          <p className="mt-3 text-sm text-ink-2">
            Bei {schwelleVoll} % voll:{" "}
            <span className="zahl font-medium text-ink">
              {prognoseDatum(prognose.prognose_voll_am)}
            </span>{" "}
            <span className="text-ink-3">({tageText(prognose.tage_bis_voll)})</span>
          </p>

          <dl className="mt-4 space-y-1 border-t pt-3 text-xs text-ink-3">
            <div className="flex justify-between gap-3">
              <dt>Anstieg</dt>
              <dd className="zahl text-ink-2">{rateText(prognose.rate_prozent_pro_tag)}</dd>
            </div>
            {prognose.rate_messung !== null && (
              <div className="flex justify-between gap-3">
                <dt>davon aus der Messreihe</dt>
                <dd className="zahl">{rateText(prognose.rate_messung)}</dd>
              </div>
            )}
            {prognose.rate_historie !== null && (
              <div className="flex justify-between gap-3">
                <dt>davon aus dem Rhythmus</dt>
                <dd className="zahl">{rateText(prognose.rate_historie)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt>Grundlage</dt>
              <dd className="text-right">{GRUNDLAGE_TEXT[prognose.grundlage]}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-2">{prognoseFehlt(prognose, rhythmus)}</p>
      )}

      {/* Rhythmus */}
      <div className="mt-4 border-t pt-3">
        <h3 className="text-sm font-semibold text-ink-2">Leerungsrhythmus</h3>
        {rhythmus && rhythmus.mittel_tage !== null ? (
          <>
            <p className="mt-1 text-lg font-semibold">{rhythmusText(rhythmus.mittel_tage)}</p>
            <p className="text-sm text-ink-2">
              {jahresText(rhythmus.leerungen_pro_jahr)}
              {guete && <span className="text-ink-3"> · {guete.text}</span>}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-ink-3">Kürzester Abstand</dt>
                <dd className="zahl">{rhythmus.kuerzester_abstand_tage} Tage</dd>
              </div>
              <div>
                <dt className="text-ink-3">Längster Abstand</dt>
                <dd className="zahl">{rhythmus.laengster_abstand_tage} Tage</dd>
              </div>
              <div>
                <dt className="text-ink-3">Leerungen erfasst</dt>
                <dd className="zahl">{rhythmus.leerungen_gesamt}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Letzte Leerung</dt>
                <dd>{alterText(rhythmus.letzte_leerung_am)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-1 text-sm text-ink-2">
            {rhythmus && rhythmus.leerungen_gesamt === 1
              ? "Erst eine Leerung erfasst – für einen Abstand braucht es zwei."
              : "Noch keine Leerung erfasst."}
          </p>
        )}
      </div>
    </section>
  );
}
