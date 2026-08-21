import { STUFEN, prozentText, stufeVon } from "@/lib/fuellstand";

/**
 * Messanzeige (Meter). Die Fuellung traegt die Statusfarbe, die Spur ist eine
 * hellere Mischung derselben Farbe mit der Flaeche - so liest sich der Zustand
 * ueber den ganzen Balken. Die Zahl steht als Text daneben, nie in der Farbe.
 */
export function Fuellstandsbalken({
  prozent,
  hoehe = 8,
  mitWert = true,
  className = "",
}: {
  prozent: number | null | undefined;
  hoehe?: number;
  mitWert?: boolean;
  className?: string;
}) {
  const stufe = stufeVon(prozent);
  const farbe = STUFEN[stufe].variable;
  const breite = prozent === null || prozent === undefined ? 0 : Math.max(0, Math.min(100, prozent));

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative min-w-0 flex-1 overflow-hidden rounded-full"
        style={{
          height: hoehe,
          background: `color-mix(in oklab, ${farbe} 18%, var(--flaeche-2))`,
        }}
        role="meter"
        aria-valuenow={breite}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Fuellstand"
      >
        <div
          className="absolute left-0 top-0 h-full"
          style={{
            width: `${breite}%`,
            background: farbe,
            borderTopRightRadius: hoehe / 2,
            borderBottomRightRadius: hoehe / 2,
          }}
        />
      </div>
      {mitWert && (
        <span className="zahl w-12 shrink-0 text-right text-sm font-semibold text-ink">
          {prozentText(prozent)}
        </span>
      )}
    </div>
  );
}
