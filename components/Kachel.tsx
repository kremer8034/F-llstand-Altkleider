import type { ReactNode } from "react";

/**
 * Kennzahlkachel: Bezeichnung, Wert, optional ein Zusatz. Die Zahl steht in
 * Textfarbe - ein farbiges Symbol daneben traegt den Zustand.
 */
export function Kachel({
  bezeichnung,
  wert,
  zusatz,
  symbol,
  href,
}: {
  bezeichnung: string;
  wert: ReactNode;
  zusatz?: ReactNode;
  symbol?: ReactNode;
  href?: string;
}) {
  const inhalt = (
    <>
      <div className="flex items-center gap-2 text-sm text-ink-2">
        {symbol}
        <span>{bezeichnung}</span>
      </div>
      <div className="mt-2 text-3xl font-semibold text-ink">{wert}</div>
      {zusatz && <div className="mt-1 text-xs text-ink-3">{zusatz}</div>}
    </>
  );

  const klassen = "karte-flaeche block p-4";

  return href ? (
    <a href={href} className={`${klassen} transition hover:border-ink-3`}>
      {inhalt}
    </a>
  ) : (
    <div className={klassen}>{inhalt}</div>
  );
}
