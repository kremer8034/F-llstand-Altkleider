import { adminClient } from "@/lib/supabase/admin";

/**
 * Annahme von Messwerten - unabhaengig davon, auf welchem Weg sie hereinkamen.
 *
 * Es gibt zwei Wege:
 *
 *   a) /api/ingest          - die eigene Firmware signiert ihre Meldung
 *   b) /api/ingest/webhook  - Fertiggeraete, die das nicht koennen, weisen
 *                             sich mit einem gemeinsamen Schluessel aus
 *                             (docs/em400-tld.md)
 *
 * Was in beiden Faellen gleich ist - Geraet finden, Werte pruefen, Messung
 * speichern -, steht deshalb hier und nicht in der Route.
 */

/** Sensorzeile, soweit die Annahme sie braucht. */
export interface Sensorzeile {
  id: string;
  container_id: string | null;
  status: string;
  bauart: string;
  intervall_minuten: number;
  firmware: string | null;
}

/** Rumpf einer Meldung, wie ihn ein Geraet schickt. Alles ausser dem Abstand ist freiwillig. */
export interface Messmeldung {
  abstand_mm?: unknown;
  batterie_v?: unknown;
  /** Fertiggeraete melden ihren Ladezustand in Prozent statt in Volt. */
  batterie_prozent?: unknown;
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

const SENSORSPALTEN = "id, container_id, status, bauart, intervall_minuten, firmware";

/**
 * Geraet anhand seiner Kennung suchen.
 *
 * Die eigene Firmware weist sich mit der Geraete-ID aus, die wir selbst
 * vergeben. Ein gekauftes Geraet hat diese ID nicht - es nennt seine
 * Seriennummer, seine IMEI oder die ICCID seiner SIM, je nach Hersteller und
 * Firmwarestand. Deshalb wird der Reihe nach gesucht statt sich auf ein Feld
 * zu verlassen: welches ankommt, entscheidet das Geraet, nicht wir.
 *
 * Die Seriennummer wird beim Aufnehmen in die Geraete-ID eingetragen (siehe
 * lib/geraetearten.ts) - damit ist sie derselbe Suchweg wie beim Eigenbau.
 */
export async function sensorZuKennung(kennung: {
  geraete_id?: string | null;
  imei?: string | null;
  iccid?: string | null;
}): Promise<Sensorzeile | null> {
  const wege: [string, string | null | undefined][] = [
    ["geraete_id", kennung.geraete_id],
    ["imei", kennung.imei],
    ["iccid", kennung.iccid],
  ];

  const admin = adminClient();

  for (const [spalte, wert] of wege) {
    if (!wert) continue;
    const { data } = await admin
      .from("sensor")
      .select(SENSORSPALTEN)
      .eq(spalte, wert)
      .maybeSingle();

    if (data) return data as unknown as Sensorzeile;
  }

  return null;
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

  // Prozentwerte werden gerundet und begrenzt: die Spalte ist smallint mit
  // Pruefbedingung 0..100, und ein Geraet, das 101 meldet, soll deshalb nicht
  // seine ganze Meldung verlieren.
  const batterieProzent = (() => {
    const n = zahl(daten.batterie_prozent);
    if (n === null) return null;
    return Math.min(100, Math.max(0, Math.round(n)));
  })();

  const { error } = await admin.from("messung").insert({
    sensor_id: sensor.id,
    container_id: sensor.container_id,
    gemessen_am: gemessenAm,
    abstand_mm: zahl(daten.abstand_mm),
    batterie_v: zahl(daten.batterie_v),
    batterie_prozent: batterieProzent,
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
