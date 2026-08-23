import { adminClient } from "@/lib/supabase/admin";

/**
 * Annahme von Messwerten - unabhaengig davon, auf welchem Weg sie hereinkamen.
 *
 * Heute gibt es genau einen Weg: die eigene Firmware signiert ihre Meldung und
 * schickt sie an /api/ingest (siehe app/api/ingest/route.ts). Sollte spaeter
 * ein gekauftes Geraet dazukommen, kann es unser Signaturverfahren nicht - es
 * braucht einen zweiten Annahmeweg (docs/sensor-entscheidung.md, Abschnitt 5).
 * Was in beiden Faellen gleich ist - Geraet finden, Werte pruefen, Messung
 * speichern -, steht deshalb hier und nicht in der Route.
 */

/** Sensorzeile, soweit die Annahme sie braucht. */
export interface Sensorzeile {
  id: string;
  container_id: string | null;
  status: string;
  intervall_minuten: number;
  firmware: string | null;
}

/** Rumpf einer Meldung, wie ihn ein Geraet schickt. Alles ausser dem Abstand ist freiwillig. */
export interface Messmeldung {
  abstand_mm?: unknown;
  batterie_v?: unknown;
  temperatur_c?: unknown;
  rssi?: unknown;
  anlass?: unknown;
  firmware?: unknown;
  gemessen_am?: unknown;
}

const ANLAESSE = ["intervall", "test", "taster", "schwellwert", "neustart"] as const;

function zahl(wert: unknown): number | null {
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

/**
 * Geraet anhand seiner Kennung suchen.
 *
 * Die eigene Firmware weist sich mit der Geraete-ID aus. Ein gekauftes Geraet
 * haette diese ID nicht, wohl aber die ICCID seiner SIM - deshalb sind beide
 * Wege hier vorgesehen. Genutzt wird derzeit nur der erste.
 */
export async function sensorZuKennung(
  kennung: { geraete_id?: string | null; iccid?: string | null },
): Promise<Sensorzeile | null> {
  const spalte = kennung.geraete_id ? "geraete_id" : "iccid";
  const wert = kennung.geraete_id ?? kennung.iccid;
  if (!wert) return null;

  const { data } = await adminClient()
    .from("sensor")
    .select("id, container_id, status, intervall_minuten, firmware")
    .eq(spalte, wert)
    .maybeSingle();

  return (data as Sensorzeile | null) ?? null;
}

export type Speicherergebnis = { ok: true } | { ok: false; fehler: string };

/**
 * Eine Meldung als Messung ablegen.
 *
 * `ersatzZeitpunkt` gilt, wenn das Geraet kein `gemessen_am` mitschickt - in
 * der Route ist das der Zeitstempel aus der Kopfzeile.
 */
export async function messungSpeichern(
  sensor: Sensorzeile,
  daten: Messmeldung,
  ersatzZeitpunkt: Date,
): Promise<Speicherergebnis> {
  const admin = adminClient();

  // Der Zeitpunkt kommt aus dem Geraet und wandert unveraendert in eine
  // timestamptz-Spalte. Eine krumme Angabe (verstellte Uhr, Fehler in der
  // Firmware) laesst das Einfuegen sonst mit einem Serverfehler auflaufen, und
  // das Geraet sendet dieselbe Meldung endlos nach.
  const gemessenAm = (() => {
    if (typeof daten.gemessen_am === "string") {
      const gelesen = new Date(daten.gemessen_am);
      if (!Number.isNaN(gelesen.getTime())) return gelesen.toISOString();
    }
    return ersatzZeitpunkt.toISOString();
  })();

  const { error } = await admin.from("messung").insert({
    sensor_id: sensor.id,
    container_id: sensor.container_id,
    gemessen_am: gemessenAm,
    abstand_mm: zahl(daten.abstand_mm),
    batterie_v: zahl(daten.batterie_v),
    temperatur_c: zahl(daten.temperatur_c),
    rssi: zahl(daten.rssi),
    anlass: ANLAESSE.includes(String(daten.anlass) as (typeof ANLAESSE)[number])
      ? String(daten.anlass)
      : "intervall",
    roh: daten,
  });

  // Eine doppelt gesendete Messung (Wiederholung nach Funkabbruch) ist kein
  // Fehler - das Geraet soll seine Warteschlange trotzdem leeren duerfen.
  if (error && error.code !== "23505") {
    return { ok: false, fehler: "Messwert konnte nicht gespeichert werden" };
  }

  const firmware = typeof daten.firmware === "string" ? daten.firmware : null;
  if (firmware && firmware !== sensor.firmware) {
    await admin.from("sensor").update({ firmware }).eq("id", sensor.id);
  }

  return { ok: true };
}
