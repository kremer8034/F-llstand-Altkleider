"use client";

import { useState } from "react";
import { gruppenrechteSetzen } from "./aktionen";

/**
 * Bereitschaften eines Kontos.
 *
 * Aufgeklappt statt dauerhaft sichtbar: bei acht Bereitschaften wäre die
 * Benutzertabelle sonst breiter als der Bildschirm, und für die häufigste
 * Frage - „wer darf was" - reicht die Zusammenfassung in einer Zeile.
 */
export function Gruppenrechte({
  benutzerId,
  gruppen,
  zugeordnet,
  rolle,
}: {
  benutzerId: string;
  gruppen: { id: string; name: string }[];
  zugeordnet: string[];
  rolle: string;
}) {
  const [offen, setOffen] = useState(false);

  if (gruppen.length === 0) {
    return <span className="text-xs text-ink-3">keine angelegt</span>;
  }

  const namen = gruppen.filter((g) => zugeordnet.includes(g.id)).map((g) => g.name);

  return (
    <div className="text-left">
      <button
        type="button"
        onClick={() => setOffen((a) => !a)}
        aria-expanded={offen}
        className="text-left text-xs underline underline-offset-2"
      >
        {namen.length === 0 ? (
          <span style={rolle === "admin" ? undefined : { color: "var(--ernst)" }}>
            {rolle === "admin" ? "alle (Administration)" : "alle – nicht eingeschränkt"}
          </span>
        ) : (
          namen.join(", ")
        )}
      </button>

      {offen && (
        <form action={gruppenrechteSetzen} className="mt-2 space-y-1.5 rounded-lg border p-2">
          <input type="hidden" name="id" value={benutzerId} />
          {gruppen.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="gruppe_id"
                value={g.id}
                defaultChecked={zugeordnet.includes(g.id)}
                className="h-4 w-4"
              />
              {g.name}
            </label>
          ))}
          <p className="pt-1 text-xs text-ink-3">
            Nichts angehakt heißt <strong>alles sehen</strong> – nicht „nichts sehen".
            {rolle === "admin" && " Die Administration sieht ohnehin immer alles."}
          </p>
          <div className="flex gap-2 pt-1">
            <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
              Übernehmen
            </button>
            <button
              type="button"
              onClick={() => setOffen(false)}
              className="text-xs underline underline-offset-2"
            >
              schließen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
