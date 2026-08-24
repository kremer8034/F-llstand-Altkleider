"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer } from "@/lib/auth";

function text(formular: FormData, name: string): string | null {
  const wert = formular.get(name);
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim();
  return getrimmt === "" ? null : getrimmt;
}

/**
 * Bereitschaften pflegt die Administration, nicht die Disposition.
 *
 * Der Grund ist derselbe wie bei den Zugriffsregeln in 0019_gruppen.sql:
 * duerfte die Disposition Bereitschaften anlegen und umbenennen, koennte sie
 * sich damit auch selbst Zustaendigkeiten verschaffen - und die Trennung, um
 * die es hier geht, waere keine.
 */
async function adminErzwingen() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (benutzer.profil.rolle !== "admin") redirect("/intern?grund=keine-berechtigung");
  return benutzer;
}

function alleSeitenNeu() {
  revalidatePath("/intern/gruppen");
  revalidatePath("/intern/standorte");
  revalidatePath("/intern/routen");
  revalidatePath("/intern/touren");
  revalidatePath("/intern/benutzer");
}

export interface Gruppenergebnis {
  ok: boolean;
  fehler?: string;
}

/** Bereitschaft anlegen oder aendern. */
export async function gruppeSpeichern(
  _vorher: Gruppenergebnis | null,
  formular: FormData,
): Promise<Gruppenergebnis> {
  await adminErzwingen();

  const id = text(formular, "id");
  const name = text(formular, "name");
  if (!name) return { ok: false, fehler: "Die Bereitschaft braucht einen Namen." };

  const daten = {
    name,
    ansprechpartner: text(formular, "ansprechpartner"),
    telefon: text(formular, "telefon"),
    email: text(formular, "email"),
    bemerkung: text(formular, "bemerkung"),
    aktiv: formular.get("aktiv") === "on",
  };

  const supabase = await serverClient();
  const antwort = id
    ? await supabase.from("gruppe").update(daten).eq("id", id).select("id")
    : await supabase.from("gruppe").insert(daten).select("id");

  if (antwort.error) {
    // 23505 = der eindeutige Index auf dem kleingeschriebenen Namen.
    if (antwort.error.code === "23505") {
      return { ok: false, fehler: `Eine Bereitschaft „${name}" gibt es bereits.` };
    }
    return { ok: false, fehler: antwort.error.message };
  }

  alleSeitenNeu();
  return { ok: true };
}

/**
 * Bereitschaft loeschen.
 *
 * Ihre Standorte und Touren bleiben und fallen in die gemeinsame
 * Zustaendigkeit zurueck ("on delete set null", siehe 0019_gruppen.sql). Eine
 * aufgeloeste Bereitschaft darf keine Plaetze mit sich nehmen.
 */
export async function gruppeLoeschen(formular: FormData) {
  await adminErzwingen();

  const id = text(formular, "id");
  if (!id) return;

  const supabase = await serverClient();
  const { error } = await supabase.from("gruppe").delete().eq("id", id);
  if (error) throw new Error(error.message);

  alleSeitenNeu();
}

/**
 * Standorte einer Bereitschaft zuordnen.
 *
 * Die Auswahl ist der vollstaendige neue Stand: was nicht angehakt ist, wird
 * gelöst. Anders herum - nur hinzufuegen - liesse sich eine falsche Zuordnung
 * nie wieder wegnehmen, ohne den Standort einzeln aufzusuchen.
 */
export async function standorteZuordnen(formular: FormData) {
  await adminErzwingen();

  const gruppeId = text(formular, "gruppe_id");
  if (!gruppeId) return;

  const gewaehlt = formular
    .getAll("standort_id")
    .filter((w): w is string => typeof w === "string" && w !== "");

  const supabase = await serverClient();

  // Erst lösen, was nicht mehr dazugehört ...
  const loesen = supabase.from("standort").update({ gruppe_id: null }).eq("gruppe_id", gruppeId);
  const { error: fehlerLoesen } = gewaehlt.length
    ? await loesen.not("id", "in", `(${gewaehlt.join(",")})`)
    : await loesen;
  if (fehlerLoesen) throw new Error(fehlerLoesen.message);

  // ... dann setzen, was dazugehört.
  if (gewaehlt.length) {
    const { error } = await supabase
      .from("standort")
      .update({ gruppe_id: gruppeId })
      .in("id", gewaehlt);
    if (error) throw new Error(error.message);
  }

  alleSeitenNeu();
}

/** Regeltouren einer Bereitschaft zuordnen - gleiche Regel wie oben. */
export async function regeltourenZuordnen(formular: FormData) {
  await adminErzwingen();

  const gruppeId = text(formular, "gruppe_id");
  if (!gruppeId) return;

  const gewaehlt = formular
    .getAll("route_id")
    .filter((w): w is string => typeof w === "string" && w !== "");

  const supabase = await serverClient();

  const loesen = supabase.from("route").update({ gruppe_id: null }).eq("gruppe_id", gruppeId);
  const { error: fehlerLoesen } = gewaehlt.length
    ? await loesen.not("id", "in", `(${gewaehlt.join(",")})`)
    : await loesen;
  if (fehlerLoesen) throw new Error(fehlerLoesen.message);

  if (gewaehlt.length) {
    const { error } = await supabase
      .from("route")
      .update({ gruppe_id: gruppeId })
      .in("id", gewaehlt);
    if (error) throw new Error(error.message);
  }

  alleSeitenNeu();
}
