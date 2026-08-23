"use client";

import { useId, useMemo, useState } from "react";

export interface Auswahleintrag {
  id: string;
  /** Fettgedruckte erste Zeile. */
  titel: string;
  /** Zweite Zeile, kleiner - Adresse, Ort, Nummer. */
  unterzeile?: string | null;
  /** Rechts stehender Zusatz - Füllstand, Zustand, Zahl der Container. */
  hinweis?: string | null;
  /** Zusätzlicher Text, der bei der Suche mitzählt, aber nicht angezeigt wird. */
  suchtext?: string | null;
}

/**
 * Mehrfachauswahl aus einer Liste - Ersatz für `<select multiple>`.
 *
 * Ein `<select multiple>` ist an dieser Stelle die schlechteste verfügbare
 * Lösung: es zeigt nur eine Zeile Text je Eintrag, es verlangt Strg bzw.
 * Befehlstaste (auf dem Handy gibt es die nicht), und ein Fehlklick löscht
 * die ganze bisherige Auswahl, ohne dass man es merkt. Bei dreihundert
 * Containern ist es unbenutzbar.
 *
 * Hier stattdessen: eine durchsuchbare Liste mit Kontrollkästchen.
 *
 * **Warum echte Kontrollkästchen und keine verborgenen Felder.** Jede Zeile
 * ist ein `<input type="checkbox" name={name} value={id}>`. Damit trägt die
 * Auswahl sich von selbst in das Formular ein - die Server-Action liest sie
 * unverändert mit `formular.getAll(name)`, und die Bedienung funktioniert
 * auch ohne JavaScript.
 *
 * **Warum die Suche nur ausblendet, statt zu filtern.** Würden nicht
 * passende Zeilen aus dem Baum entfernt, ginge ihr Häkchen verloren: wer
 * zwei Container sucht, den ersten anhakt und dann den zweiten sucht, hätte
 * am Ende nur einen ausgewählt - lautlos. Deshalb bleiben alle Zeilen
 * bestehen und werden nur verborgen; ein verborgenes, angehaktes
 * Kontrollkästchen wird trotzdem abgeschickt.
 */
export function Mehrfachauswahl({
  name,
  eintraege,
  beschriftung,
  leerText = "Nichts zur Auswahl.",
  hoeheKlasse = "max-h-72",
}: {
  name: string;
  eintraege: Auswahleintrag[];
  beschriftung: string;
  leerText?: string;
  hoeheKlasse?: string;
}) {
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(new Set());
  const gruppenId = useId();

  const passend = useMemo(() => {
    const text = suche.trim().toLowerCase();
    if (!text) return null; // null = alles sichtbar
    const treffer = new Set<string>();
    for (const e of eintraege) {
      const heuhaufen = [e.titel, e.unterzeile, e.hinweis, e.suchtext]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (heuhaufen.includes(text)) treffer.add(e.id);
    }
    return treffer;
  }, [eintraege, suche]);

  const sichtbar = passend === null ? eintraege : eintraege.filter((e) => passend.has(e.id));

  function umschalten(id: string, an: boolean) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      if (an) neu.add(id);
      else neu.delete(id);
      return neu;
    });
  }

  /** Alle gerade sichtbaren an- oder abwählen - nicht die verborgenen. */
  function alleSichtbaren(an: boolean) {
    setGewaehlt((alt) => {
      const neu = new Set(alt);
      for (const e of sichtbar) {
        if (an) neu.add(e.id);
        else neu.delete(e.id);
      }
      return neu;
    });
  }

  const anzahl = gewaehlt.size;
  const alleSichtbarenGewaehlt = sichtbar.length > 0 && sichtbar.every((e) => gewaehlt.has(e.id));

  if (eintraege.length === 0) {
    return <p className="text-sm text-ink-3">{leerText}</p>;
  }

  return (
    <div className="space-y-2">
      {/* Suche und Sammelaktion */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder={`${beschriftung} suchen`}
          className="feld max-w-xs flex-1"
          aria-label={`${beschriftung} suchen`}
        />
        {sichtbar.length > 0 && (
          <button
            type="button"
            onClick={() => alleSichtbaren(!alleSichtbarenGewaehlt)}
            className="knopf-sekundaer px-3 py-1.5 text-sm"
          >
            {alleSichtbarenGewaehlt
              ? suche
                ? "Treffer abwählen"
                : "Keine"
              : suche
                ? `Alle ${sichtbar.length} Treffer`
                : "Alle"}
          </button>
        )}
      </div>

      {/* Die Liste */}
      <div
        role="group"
        aria-labelledby={gruppenId}
        className={`${hoeheKlasse} overflow-y-auto rounded-lg border`}
      >
        <span id={gruppenId} className="sr-only">
          {beschriftung}
        </span>

        {sichtbar.length === 0 ? (
          <p className="p-4 text-center text-sm text-ink-3">
            Kein Treffer für „{suche}“.
          </p>
        ) : (
          <ul className="divide-y">
            {eintraege.map((e) => {
              const verborgen = passend !== null && !passend.has(e.id);
              const an = gewaehlt.has(e.id);
              return (
                <li key={e.id} hidden={verborgen}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition ${
                      an ? "bg-flaeche-2" : "hover:bg-flaeche-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name={name}
                      value={e.id}
                      checked={an}
                      onChange={(ev) => umschalten(e.id, ev.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{e.titel}</span>
                      {e.unterzeile && (
                        <span className="block text-xs text-ink-3">{e.unterzeile}</span>
                      )}
                    </span>
                    {e.hinweis && (
                      <span className="zahl shrink-0 text-xs text-ink-3">{e.hinweis}</span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Was ausgewählt ist - auch das, was die Suche gerade verbirgt. Ohne
          diese Zeile wüsste niemand, dass er drei Treffer weiter oben schon
          etwas angehakt hat. */}
      <div className="flex min-h-[1.5rem] flex-wrap items-center gap-1.5 text-xs">
        {anzahl === 0 ? (
          <span className="text-ink-3">Nichts ausgewählt</span>
        ) : (
          <>
            <span className="text-ink-2">
              {anzahl} ausgewählt
              {passend !== null && ":"}
            </span>
            {eintraege
              .filter((e) => gewaehlt.has(e.id))
              .slice(0, 12)
              .map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => umschalten(e.id, false)}
                  className="inline-flex items-center gap-1 rounded border bg-flaeche px-1.5 py-0.5 text-ink-2 hover:text-ink"
                  aria-label={`${e.titel} abwählen`}
                >
                  {e.titel}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            {anzahl > 12 && <span className="text-ink-3">und {anzahl - 12} weitere</span>}
          </>
        )}
      </div>
    </div>
  );
}
