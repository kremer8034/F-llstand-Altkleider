"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";

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

export interface Entsorgerergebnis {
  ok: boolean;
  fehler?: string;
}

/**
 * Bauhof anlegen oder aendern.
 *
 * Ohne Telefon und ohne E-Mail wird nicht gespeichert. Ein Eintrag, den
 * niemand erreichen kann, ist schlimmer als gar keiner: er sagt dem
 * Fahrpersonal "es gibt eine Absprache", und dann steht es am Container und
 * kommt nicht weiter. Die Datenbank haelt dieselbe Bedingung (Pruefbedingung
 * entsorger_erreichbar) - hier steht sie nur, damit es eine lesbare Meldung
 * gibt statt eines Datenbankfehlers.
 */
export async function entsorgerSpeichern(
  _vorher: Entsorgerergebnis | null,
  formular: FormData,
): Promise<Entsorgerergebnis> {
  await berechtigt();

  const id = text(formular, "id");
  const name = text(formular, "name");
  const telefon = text(formular, "telefon");
  const email = text(formular, "email");

  if (!name) return { ok: false, fehler: "Der Bauhof braucht einen Namen." };
  if (!telefon && !email) {
    return {
      ok: false,
      fehler:
        "Bitte Telefon oder E-Mail angeben. Ohne Kontaktmöglichkeit nützt der Eintrag dem Fahrpersonal nichts.",
    };
  }

  const daten = {
    name,
    gemeinde: text(formular, "gemeinde"),
    telefon,
    email,
    ansprechpartner: text(formular, "ansprechpartner"),
    erreichbar: text(formular, "erreichbar"),
    bemerkung: text(formular, "bemerkung"),
    aktiv: formular.get("aktiv") === "on",
  };

  const supabase = await serverClient();

  const antwort = id
    ? await supabase.from("entsorger").update(daten).eq("id", id)
    : await supabase.from("entsorger").insert(daten);

  if (antwort.error) return { ok: false, fehler: antwort.error.message };

  revalidatePath("/intern/entsorger");
  revalidatePath("/intern/standorte");
  return { ok: true };
}

/**
 * Bauhof loeschen.
 *
 * Die Standorte behalten ihre Zuordnung nicht - `on delete set null` setzt
 * sie zurueck. Das ist gewollt und die ehrliche Folge: gibt es den Bauhof
 * nicht mehr, gibt es auch die Absprache nicht mehr, und das Fahrpersonal
 * bekommt wieder "Müll mitnehmen" angezeigt statt einer toten Rufnummer.
 */
export async function entsorgerLoeschen(formular: FormData) {
  await berechtigt();

  const id = text(formular, "id");
  if (!id) return;

  const supabase = await serverClient();
  const { error } = await supabase.from("entsorger").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/intern/entsorger");
  revalidatePath("/intern/standorte");
}
