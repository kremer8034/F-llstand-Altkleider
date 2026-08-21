"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer } from "@/lib/auth";

export interface Importzeile {
  nummer: string;
  externe_id?: string | null;
  bezeichnung?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  lat?: number | null;
  lng?: number | null;
  typ?: string | null;
  volumen_liter?: number | null;
  aufstelldatum?: string | null;
  bemerkung?: string | null;
}

export interface Importergebnis {
  ok: boolean;
  fehler?: string;
  neu?: number;
  aktualisiert?: number;
}

/**
 * Container aus einem Export der Dienstleistungsdatenbank uebernehmen.
 *
 * Abgeglichen wird ueber die Containernummer: bekannte Nummern werden
 * aktualisiert, unbekannte neu angelegt. Kalibrierung, Status und die
 * Sensorzuordnung bleiben dabei unangetastet - die pflegen wir selbst.
 */
export async function containerImportieren(zeilen: Importzeile[]): Promise<Importergebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (benutzer.profil.rolle === "fahrer") return { ok: false, fehler: "Keine Berechtigung." };

  const gueltige = zeilen.filter((z) => z.nummer && z.nummer.trim() !== "");
  if (gueltige.length === 0) return { ok: false, fehler: "Keine Zeile mit Containernummer gefunden." };
  if (gueltige.length > 2000) return { ok: false, fehler: "Bitte höchstens 2000 Zeilen auf einmal importieren." };

  const supabase = serverClient();

  const { data: vorhanden } = await supabase
    .from("container")
    .select("nummer")
    .in(
      "nummer",
      gueltige.map((z) => z.nummer),
    );

  const bekannt = new Set((vorhanden ?? []).map((c) => c.nummer as string));

  const { error } = await supabase.from("container").upsert(
    gueltige.map((z) => ({
      nummer: z.nummer.trim(),
      externe_id: z.externe_id ?? null,
      bezeichnung: z.bezeichnung ?? null,
      strasse: z.strasse ?? null,
      plz: z.plz ?? null,
      ort: z.ort ?? null,
      lat: z.lat ?? null,
      lng: z.lng ?? null,
      typ: z.typ || "Depotcontainer",
      volumen_liter: z.volumen_liter ?? null,
      aufstelldatum: z.aufstelldatum ?? null,
      bemerkung: z.bemerkung ?? null,
    })),
    { onConflict: "nummer", ignoreDuplicates: false },
  );

  if (error) return { ok: false, fehler: error.message };

  revalidatePath("/intern/container");
  revalidatePath("/intern/karte");
  revalidatePath("/");

  const aktualisiert = gueltige.filter((z) => bekannt.has(z.nummer)).length;
  return { ok: true, neu: gueltige.length - aktualisiert, aktualisiert };
}
