"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";

export interface Importzeile {
  /** Name des Platzes - der Schluessel, ueber den abgeglichen wird. */
  name: string;
  kuerzel?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  lat?: number | null;
  lng?: number | null;
  zufahrt?: string | null;
  bemerkung?: string | null;
  /** Wie viele Container hier stehen. Leer heisst: nicht anfassen. */
  anzahl_container?: number | null;
}

export interface Importergebnis {
  ok: boolean;
  fehler?: string;
  /**
   * Bei welcher Zeile es aufhoerte. Der Import laeuft Platz fuer Platz und
   * schreibt sofort; bricht er in der Mitte ab, ist die erste Haelfte bereits
   * drin. Das gehoert gesagt - sonst spielt jemand dieselbe Datei noch einmal
   * ein und wundert sich ueber doppelte Container.
   */
  abgebrochen_bei?: number;
  neu?: number;
  aktualisiert?: number;
  behaelter_angelegt?: number;
  behaelter_stillgelegt?: number;
  behaelter_geloescht?: number;
  ohne_koordinaten?: number;
}

/**
 * Standorte einspielen.
 *
 * Bis 0022 wurden hier Container importiert - mit Anschrift, Koordinaten und
 * Volumen je Container. Das war die Quelle der Dopplung, die dieser Umbau
 * beseitigt: dieselbe Adresse stand am Platz und an jedem Container darauf.
 *
 * Jetzt ist der Platz die Einheit. Die Container entstehen aus einer Zahl -
 * "hier stehen sechs" - und bekommen ihre Nummern aus dem Kuerzel des Platzes.
 * Was ein einzelner Container an Eigenem traegt (Status, Sensor, Geschichte),
 * ruehrt der Import nicht an; das pflegen wir selbst und wuerden es uns mit
 * jedem Einspielen ueberschreiben.
 *
 * Abgeglichen wird ueber den Namen, ohne Gross- und Kleinschreibung und ohne
 * fuehrende Leerzeichen - sonst legt eine Tabelle mit "Netto Parkplatz" und
 * "netto parkplatz " zwei Plaetze an.
 */
export async function standorteImportieren(zeilen: Importzeile[]): Promise<Importergebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (!darfBearbeiten(benutzer.profil.rolle)) return { ok: false, fehler: "Keine Berechtigung." };

  const gueltige = zeilen.filter((z) => z.name && z.name.trim() !== "");
  if (gueltige.length === 0) return { ok: false, fehler: "Keine Zeile mit Standortnamen gefunden." };
  if (gueltige.length > 2000) {
    return { ok: false, fehler: "Bitte höchstens 2000 Zeilen auf einmal importieren." };
  }

  const schluessel = (name: string) => name.trim().toLowerCase();
  const supabase = await serverClient();

  const { data: vorhanden } = await supabase.from("standort").select("id, name");
  const nachName = new Map<string, string>();
  ((vorhanden ?? []) as { id: string; name: string }[]).forEach((s) =>
    nachName.set(schluessel(s.name), s.id),
  );

  let neu = 0;
  let aktualisiert = 0;
  let angelegt = 0;
  let stillgelegt = 0;
  let geloescht = 0;
  let ohneKoordinaten = 0;
  let zeilennummer = 0;

  /** Was bis hierher tatsaechlich geschrieben wurde. */
  const bilanz = (): Omit<Importergebnis, "ok" | "fehler" | "abgebrochen_bei"> => ({
    neu,
    aktualisiert,
    behaelter_angelegt: angelegt,
    behaelter_stillgelegt: stillgelegt,
    behaelter_geloescht: geloescht,
    ohne_koordinaten: ohneKoordinaten,
  });

  for (const z of gueltige) {
    zeilennummer += 1;
    const name = z.name.trim();
    const vorhandeneId = nachName.get(schluessel(name));

    // Nur setzen, was in der Datei steht. Eine leere Zelle heisst "nicht
    // angegeben" und nicht "loeschen" - sonst raeumt ein Teilexport gepflegte
    // Angaben ab, ohne dass es jemand merkt.
    const daten: Record<string, unknown> = { name };
    if (z.kuerzel != null && z.kuerzel !== "") daten.kuerzel = z.kuerzel.trim().toUpperCase();
    if (z.strasse != null) daten.strasse = z.strasse;
    if (z.plz != null) daten.plz = z.plz;
    if (z.ort != null) daten.ort = z.ort;
    if (z.lat != null) daten.lat = z.lat;
    if (z.lng != null) daten.lng = z.lng;
    if (z.zufahrt != null) daten.zufahrt = z.zufahrt;
    if (z.bemerkung != null) daten.bemerkung = z.bemerkung;

    let standortId = vorhandeneId;

    if (standortId) {
      const { error } = await supabase.from("standort").update(daten).eq("id", standortId);
      if (error) return { ok: false, fehler: error.message, abgebrochen_bei: zeilennummer, ...bilanz() };
      aktualisiert += 1;
    } else {
      if (!daten.kuerzel) {
        const { data: vorschlag } = await supabase.rpc("standort_kuerzel_vorschlag", {
          p_name: name,
          p_id: null,
        });
        if (typeof vorschlag === "string") daten.kuerzel = vorschlag;
      }
      const { data: erzeugt, error } = await supabase
        .from("standort")
        .insert(daten)
        .select("id")
        .single();
      if (error) return { ok: false, fehler: error.message, abgebrochen_bei: zeilennummer, ...bilanz() };
      standortId = erzeugt.id as string;
      nachName.set(schluessel(name), standortId);
      neu += 1;
    }

    if (z.lat == null || z.lng == null) ohneKoordinaten += 1;

    if (z.anzahl_container != null && z.anzahl_container >= 0) {
      const { data: ergebnisAnzahl, error } = await supabase.rpc("standort_container_setzen", {
        p_standort_id: standortId,
        p_anzahl: Math.round(z.anzahl_container),
      });
      if (error) return { ok: false, fehler: error.message, abgebrochen_bei: zeilennummer, ...bilanz() };
      const b = ergebnisAnzahl as { angelegt?: number; stillgelegt?: number; geloescht?: number } | null;
      angelegt += b?.angelegt ?? 0;
      stillgelegt += b?.stillgelegt ?? 0;
      geloescht += b?.geloescht ?? 0;
    }
  }

  revalidatePath("/intern/standorte");
  revalidatePath("/intern/karte");
  revalidatePath("/");

  return { ok: true, ...bilanz() };
}
