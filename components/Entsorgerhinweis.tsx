import type { StandortEntsorgung } from "@/lib/typen";

/**
 * Was am Container mit dem Fremdmüll geschieht.
 *
 * Zwei Zustände, und beide sind eine Anweisung – nicht „Daten vorhanden“ und
 * „Daten fehlen“. Ist ein Bauhof hinterlegt, gibt es eine Absprache mit der
 * Gemeinde: Müll stehen lassen, anrufen. Ist keiner hinterlegt, gibt es keine
 * Absprache: Müll mitnehmen. Das ist kein Mangel im Datenbestand, sondern die
 * gültige Auskunft, und sie steht hier so, dass niemand raten muss.
 *
 * Bewusst eine gemeinsame Komponente für Standortseite und Fahreransicht: die
 * Unterscheidung darf an beiden Stellen nicht unterschiedlich ausfallen.
 */
export function Entsorgerhinweis({
  entsorgung,
  gross = false,
}: {
  entsorgung: StandortEntsorgung | null;
  gross?: boolean;
}) {
  if (!entsorgung?.abholung_vereinbart) {
    return (
      <div
        className="rounded-lg border-l-4 bg-flaeche-2 p-3"
        style={{ borderLeftColor: "var(--ernst)" }}
      >
        <p className={`font-semibold ${gross ? "text-base" : "text-sm"}`}>
          Müll bitte mitnehmen
        </p>
        <p className="mt-1 text-xs text-ink-2">
          Für diesen Standort ist kein Bauhof hinterlegt – es gibt keine Abholvereinbarung.
        </p>
      </div>
    );
  }

  const telefonWahl = entsorgung.telefon?.replace(/[^\d+]/g, "");

  return (
    <div
      className="rounded-lg border-l-4 bg-flaeche-2 p-3"
      style={{ borderLeftColor: "var(--gut)" }}
    >
      <p className={`font-semibold ${gross ? "text-base" : "text-sm"}`}>
        Müll stehen lassen, Bauhof rufen
      </p>
      <p className="mt-1 text-sm">{entsorgung.entsorger_name}</p>

      {entsorgung.ansprechpartner && (
        <p className="text-xs text-ink-2">{entsorgung.ansprechpartner}</p>
      )}

      {entsorgung.telefon && (
        <a
          href={`tel:${telefonWahl}`}
          className={`knopf-primaer mt-2 ${gross ? "w-full py-3 text-base" : "px-3 py-1.5 text-sm"}`}
        >
          {entsorgung.telefon} anrufen
        </a>
      )}

      {entsorgung.email && !entsorgung.telefon && (
        <a
          href={`mailto:${entsorgung.email}`}
          className="mt-2 block text-sm underline underline-offset-2"
        >
          {entsorgung.email}
        </a>
      )}

      {entsorgung.erreichbar && (
        <p className="mt-2 text-xs text-ink-3">{entsorgung.erreichbar}</p>
      )}
      {entsorgung.entsorger_bemerkung && (
        <p className="mt-1 text-xs text-ink-3">{entsorgung.entsorger_bemerkung}</p>
      )}
    </div>
  );
}
