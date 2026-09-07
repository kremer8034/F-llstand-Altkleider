"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { isoWochentag } from "@/lib/wochentage";
import { tagAlsZeitpunkt } from "@/lib/zeit";

function text(formular: FormData, name: string): string | null {
  const wert = formular.get(name);
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim();
  return getrimmt === "" ? null : getrimmt;
}

async function berechtigt() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (!darfBearbeiten(benutzer.profil.rolle)) redirect("/intern?grund=keine-berechtigung");
}

function alleSeitenNeu(id?: string) {
  revalidatePath("/intern/routen");
  revalidatePath("/intern/touren");
  revalidatePath("/intern/standorte");
  if (id) revalidatePath(`/intern/routen/${id}`);
}

export interface Routenergebnis {
  ok: boolean;
  fehler?: string;
}

/**
 * Anlegen und Bearbeiten.
 *
 * Der Wochentag wird aus dem Ankerdatum abgeleitet, nicht getrennt abgefragt:
 * die Datenbank verlangt, dass beides zusammenpasst (Pruefbedingung
 * route_anker_passt), und zwei Felder, die dasselbe sagen muessen, sind eine
 * Fehlerquelle ohne Nutzen.
 */
export async function routeSpeichern(
  _vorher: Routenergebnis | null,
  formular: FormData,
): Promise<Routenergebnis> {
  await berechtigt();

  const id = text(formular, "id");
  const anker = text(formular, "anker_datum");
  const name = text(formular, "name");

  if (!name) return { ok: false, fehler: "Die Route braucht einen Namen." };
  if (!anker) return { ok: false, fehler: "Bitte einen Termin angeben, an dem die Tour tatsächlich fährt." };

  const ankerDatum = tagAlsZeitpunkt(anker);
  if (Number.isNaN(ankerDatum.getTime())) {
    return { ok: false, fehler: "Das Datum ist nicht lesbar." };
  }

  const intervall = Number(text(formular, "intervall_wochen") ?? "1");
  if (!Number.isFinite(intervall) || intervall < 1 || intervall > 52) {
    return { ok: false, fehler: "Der Abstand muss zwischen 1 und 52 Wochen liegen." };
  }

  const daten = {
    name,
    farbe: text(formular, "farbe"),
    wochentag: isoWochentag(ankerDatum),
    intervall_wochen: Math.round(intervall),
    anker_datum: anker,
    gruppe_id: text(formular, "gruppe_id"),
    aktiv: formular.get("aktiv") === "on",
    bemerkung: text(formular, "bemerkung"),
  };

  const supabase = await serverClient();

  if (id) {
    const { error } = await supabase.from("route").update(daten).eq("id", id);
    if (error) return { ok: false, fehler: error.message };
    alleSeitenNeu(id);
    redirect(`/intern/routen/${id}`);
  }

  const { data, error } = await supabase.from("route").insert(daten).select("id").single();
  if (error) return { ok: false, fehler: error.message };

  alleSeitenNeu();
  redirect(`/intern/routen/${data.id}`);
}

/** Standorte dieser Route zuordnen. */
export async function standorteZuordnen(formular: FormData) {
  await berechtigt();

  const routeId = text(formular, "route_id");
  const standortIds = formular.getAll("standort_id").filter((w): w is string => typeof w === "string");
  if (!routeId || standortIds.length === 0) return;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("route_standort")
    .upsert(
      standortIds.map((standort_id) => ({ route_id: routeId, standort_id })),
      { onConflict: "route_id,standort_id", ignoreDuplicates: true },
    );

  if (error) throw new Error(error.message);
  alleSeitenNeu(routeId);
}

/** Einen Standort aus der Route nehmen. */
export async function standortEntfernen(formular: FormData) {
  await berechtigt();

  const routeId = text(formular, "route_id");
  const standortId = text(formular, "standort_id");
  if (!routeId || !standortId) return;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("route_standort")
    .delete()
    .eq("route_id", routeId)
    .eq("standort_id", standortId);

  if (error) throw new Error(error.message);
  alleSeitenNeu(routeId);
}

export async function routeLoeschen(formular: FormData) {
  await berechtigt();

  const id = text(formular, "id");
  if (!id) return;

  const supabase = await serverClient();
  const { error } = await supabase.from("route").delete().eq("id", id);
  if (error) throw new Error(error.message);

  alleSeitenNeu();
  redirect("/intern/routen");
}
