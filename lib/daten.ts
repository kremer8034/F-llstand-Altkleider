import type { SupabaseClient } from "@supabase/supabase-js";
import type { Alarm, Container, ContainerZustand, Sensor } from "./typen";

export interface ContainerZeile extends Container {
  zustand: ContainerZustand | null;
  sensor: Pick<Sensor, "id" | "geraete_id" | "status" | "letzte_meldung_am" | "batterie_v"> | null;
}

/**
 * Container, aktueller Zustand und zugehoeriger Sensor in einem Rutsch.
 *
 * Bewusst drei einfache Abfragen statt eines verschachtelten Selects: bei
 * einigen hundert Containern ist das schnell, gut nachvollziehbar und
 * unabhaengig davon, wie PostgREST die Beziehungen aufloest.
 */
export async function containerMitZustand(supabase: SupabaseClient): Promise<ContainerZeile[]> {
  const [container, zustaende, sensoren] = await Promise.all([
    supabase.from("container").select("*").order("nummer"),
    supabase.from("container_zustand").select("*"),
    supabase.from("sensor").select("id, geraete_id, status, letzte_meldung_am, batterie_v, container_id"),
  ]);

  const zustandJeContainer = new Map<string, ContainerZustand>();
  (zustaende.data ?? []).forEach((z) => zustandJeContainer.set(z.container_id, z as ContainerZustand));

  const sensorJeContainer = new Map<string, ContainerZeile["sensor"]>();
  (sensoren.data ?? []).forEach((s) => {
    if (s.container_id) sensorJeContainer.set(s.container_id, s);
  });

  return (container.data ?? []).map((c) => ({
    ...(c as Container),
    zustand: zustandJeContainer.get(c.id) ?? null,
    sensor: sensorJeContainer.get(c.id) ?? null,
  }));
}

export async function offeneAlarme(supabase: SupabaseClient): Promise<(Alarm & { container: Pick<Container, "id" | "nummer" | "bezeichnung" | "ort"> | null })[]> {
  const { data } = await supabase
    .from("alarm")
    .select("*, container:container_id (id, nummer, bezeichnung, ort)")
    .is("geschlossen_am", null)
    .order("ausgeloest_am", { ascending: false })
    .limit(100);

  return (data ?? []) as never;
}

export async function einstellungen(supabase: SupabaseClient): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("einstellung").select("schluessel, wert");
  const werte: Record<string, unknown> = {};
  (data ?? []).forEach((e) => (werte[e.schluessel] = e.wert));
  return werte;
}

export function zahlAusEinstellung(werte: Record<string, unknown>, schluessel: string, standard: number): number {
  const wert = werte[schluessel];
  const zahl = typeof wert === "number" ? wert : Number(wert);
  return Number.isFinite(zahl) ? zahl : standard;
}
