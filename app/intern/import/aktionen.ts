"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";

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
  /** Name des Standorts. Unbekannte Namen legen einen Standort an. */
  standort?: string | null;
}

export interface Importergebnis {
  ok: boolean;
  fehler?: string;
  neu?: number;
  aktualisiert?: number;
  standorte_neu?: number;
  standorte_zugeordnet?: number;
}

/**
 * Container aus einem Export der Dienstleistungsdatenbank uebernehmen.
 *
 * Abgeglichen wird ueber die Containernummer: bekannte Nummern werden
 * aktualisiert, unbekannte neu angelegt. Kalibrierung, Status und die
 * Sensorzuordnung bleiben dabei unangetastet - die pflegen wir selbst.
 *
 * Die optionale Spalte "standortname" traegt die Clusterzuordnung mit. Sie nimmt
 * der Zuordnung von Hand nichts ab - es entscheidet weiterhin ein Mensch,
 * welche Container zusammengehoeren - erspart bei mehreren hundert Containern
 * aber die Klickarbeit. Ohne die Spalte aendert sich am Import nichts.
 */
export async function containerImportieren(zeilen: Importzeile[]): Promise<Importergebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (!darfBearbeiten(benutzer.profil.rolle)) return { ok: false, fehler: "Keine Berechtigung." };

  const gueltige = zeilen.filter((z) => z.nummer && z.nummer.trim() !== "");
  if (gueltige.length === 0) return { ok: false, fehler: "Keine Zeile mit Containernummer gefunden." };
  if (gueltige.length > 2000) return { ok: false, fehler: "Bitte höchstens 2000 Zeilen auf einmal importieren." };

  const supabase = await serverClient();

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

  const standorte = await standorteZuordnen(supabase, gueltige);

  revalidatePath("/intern/container");
  revalidatePath("/intern/standorte");
  revalidatePath("/intern/karte");
  revalidatePath("/");

  const aktualisiert = gueltige.filter((z) => bekannt.has(z.nummer)).length;
  return {
    ok: true,
    neu: gueltige.length - aktualisiert,
    aktualisiert,
    ...standorte,
  };
}

/**
 * Standorte aus der Standortspalte anlegen und die Container zuordnen.
 *
 * In der Importdatei heisst die Spalte "standortname" (oder "cluster",
 * "platz", "containerstandort", "sammelstelle") - NICHT "standort": so heisst
 * im Export der Dienstleistungsdatenbank die Bezeichnung des einzelnen
 * Containers. Die Zuordnung der Spaltennamen steht in Importbereich.tsx; hier
 * kommt sie als Feld `standort` der Importzeile an.
 *
 * Verglichen wird ueber den Namen, ohne Gross- und Kleinschreibung und ohne
 * fuehrende Leerzeichen - sonst legt eine Tabelle mit "Netto Parkplatz" und
 * "netto parkplatz " zwei Standorte an.
 */
async function standorteZuordnen(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  zeilen: Importzeile[],
): Promise<{ standorte_neu: number; standorte_zugeordnet: number }> {
  const mitStandort = zeilen.filter((z) => z.standort && z.standort.trim() !== "");
  if (mitStandort.length === 0) return { standorte_neu: 0, standorte_zugeordnet: 0 };

  const schluessel = (name: string) => name.trim().toLowerCase();

  const gewuenscht = new Map<string, string>();
  mitStandort.forEach((z) => gewuenscht.set(schluessel(z.standort!), z.standort!.trim()));

  const { data: vorhanden } = await supabase.from("standort").select("id, name");
  const nachName = new Map<string, string>();
  ((vorhanden ?? []) as { id: string; name: string }[]).forEach((s) =>
    nachName.set(schluessel(s.name), s.id),
  );

  const fehlend = [...gewuenscht.entries()].filter(([k]) => !nachName.has(k));

  if (fehlend.length > 0) {
    const { data: angelegt, error } = await supabase
      .from("standort")
      .insert(
        fehlend.map(([, name]) => {
          const zeile = mitStandort.find((z) => schluessel(z.standort!) === schluessel(name));
          return {
            name,
            strasse: zeile?.strasse ?? null,
            plz: zeile?.plz ?? null,
            ort: zeile?.ort ?? null,
            lat: zeile?.lat ?? null,
            lng: zeile?.lng ?? null,
          };
        }),
      )
      .select("id, name");

    if (error) throw new Error(error.message);
    ((angelegt ?? []) as { id: string; name: string }[]).forEach((s) =>
      nachName.set(schluessel(s.name), s.id),
    );
  }

  // Je Standort ein Aufruf statt je Container - bei 300 Containern an 40
  // Standorten sind das 40 Anfragen statt 300.
  const jeStandort = new Map<string, string[]>();
  mitStandort.forEach((z) => {
    const id = nachName.get(schluessel(z.standort!));
    if (!id) return;
    const liste = jeStandort.get(id) ?? [];
    liste.push(z.nummer.trim());
    jeStandort.set(id, liste);
  });

  let zugeordnet = 0;
  for (const [standortId, nummern] of jeStandort) {
    const { error, count } = await supabase
      .from("container")
      .update({ standort_id: standortId }, { count: "exact" })
      .in("nummer", nummern);
    if (error) throw new Error(error.message);
    zugeordnet += count ?? nummern.length;
  }

  return { standorte_neu: fehlend.length, standorte_zugeordnet: zugeordnet };
}
