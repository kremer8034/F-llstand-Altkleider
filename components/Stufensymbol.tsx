import type { Fuellstandsstufe } from "@/lib/typen";
import { STUFEN } from "@/lib/fuellstand";

/**
 * Jede Fuellstandsstufe hat eine eigene FORM, nicht nur eine Farbe. Damit bleibt
 * der Zustand auch bei Farbfehlsichtigkeit, im Graustufendruck und in
 * forced-colors lesbar.
 */
export function Stufensymbol({
  stufe,
  groesse = 16,
  className = "",
}: {
  stufe: Fuellstandsstufe;
  groesse?: number;
  className?: string;
}) {
  const farbe = STUFEN[stufe].variable;

  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 16 16"
      role="img"
      aria-label={STUFEN[stufe].text}
      className={className}
      style={{ flex: "none" }}
    >
      {stufe === "frei" && <circle cx="8" cy="8" r="5.5" fill="none" stroke={farbe} strokeWidth="2" />}

      {stufe === "teilweise" && (
        <>
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={farbe} strokeWidth="2" />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill={farbe} />
        </>
      )}

      {stufe === "hoch" && (
        <path d="M8 1.6 15 14H1z" fill="none" stroke={farbe} strokeWidth="2" strokeLinejoin="round" />
      )}

      {stufe === "voll" && (
        <>
          <path d="M8 1.6 15 14H1z" fill={farbe} />
          <path d="M8 6v3.4" stroke="var(--flaeche)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.6" r="1" fill="var(--flaeche)" />
        </>
      )}

      {stufe === "unbekannt" && (
        <circle
          cx="8"
          cy="8"
          r="5.5"
          fill="none"
          stroke={farbe}
          strokeWidth="2"
          strokeDasharray="2.6 2.4"
        />
      )}
    </svg>
  );
}

/** Farbiges Symbol plus Text - die Kombination, die ueberall verwendet wird. */
export function Stufenkennzeichen({
  stufe,
  text,
  className = "",
}: {
  stufe: Fuellstandsstufe;
  text?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      <Stufensymbol stufe={stufe} />
      <span className="text-ink-2">{text ?? STUFEN[stufe].text}</span>
    </span>
  );
}
