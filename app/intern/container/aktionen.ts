"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer } from "@/lib/auth";

function text(formular: FormData, feld: string): string | null {
  const wert = formular.get(feld);
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim();
  return getrimmt === "" ? null : getrimmt;
}

function zahl(formular: FormData, feld: string): number | null {
  const wert = text(formular, feld);
  if (wert === null) return null;
  const n = Number(wert.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Leerung von Hand erfassen (auch Fahrpersonal). */
export async function leerungErfassen(formular: FormData) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");

  const containerId = text(formular, "container_id");
  if (!containerId) return;

  const supabase = serverClient();
  const { error } = await supabase.from("leerung").insert({
    container_id: containerId,
    fuellstand_vorher: zahl(formular, "fuellstand_vorher"),
    fuellstand_nachher: 0,
    art: "manuell",
    erfasst_von: benutzer.id,
    menge_kg: zahl(formular, "menge_kg"),
    notiz: text(formular, "notiz"),
  });

  if (error) throw new Error(`Leerung konnte nicht gespeichert werden: ${error.message}`);

  revalidatePath(`/intern/container/${containerId}`);
  revalidatePath("/intern/touren");
  revalidatePath("/intern");
}

/** Zustandsmeldung vor Ort (voll, beschaedigt, vermuellt, ...). */
export async function meldungErfassen(formular: FormData) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");

  const containerId = text(formular, "container_id");
  if (!containerId) return;

  const supabase = serverClient();
  const { error } = await supabase.from("meldung").insert({
    container_id: containerId,
    typ: text(formular, "typ") ?? "sonstiges",
    text: text(formular, "text"),
    gemeldet_von: benutzer.id,
  });

  if (error) throw new Error(`Meldung konnte nicht gespeichert werden: ${error.message}`);

  revalidatePath(`/intern/container/${containerId}`);
  revalidatePath("/intern/touren");
}

export async function meldungErledigen(formular: FormData) {
  const id = text(formular, "id");
  const containerId = text(formular, "container_id");
  if (!id) return;

  const supabase = serverClient();
  await supabase.from("meldung").update({ erledigt_am: new Date().toISOString() }).eq("id", id);

  if (containerId) revalidatePath(`/intern/container/${containerId}`);
  revalidatePath("/intern/touren");
}

/** Kalibrierung: Leerwert messen lassen oder von Hand setzen. */
export async function kalibrieren(formular: FormData) {
  const containerId = text(formular, "container_id");
  if (!containerId) return;

  const supabase = serverClient();
  const { error } = await supabase.rpc("container_kalibrieren", {
    p_container_id: containerId,
    p_leer_abstand_mm: zahl(formular, "leer_abstand_mm"),
    p_voll_abstand_mm: zahl(formular, "voll_abstand_mm"),
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/intern/container/${containerId}`);
}

export async function alarmQuittieren(formular: FormData) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");

  const id = text(formular, "id");
  const containerId = text(formular, "container_id");
  if (!id) return;

  const supabase = serverClient();
  await supabase
    .from("alarm")
    .update({ quittiert_am: new Date().toISOString(), quittiert_von: benutzer.id })
    .eq("id", id);

  if (containerId) revalidatePath(`/intern/container/${containerId}`);
  revalidatePath("/intern");
}

/** Container anlegen oder aendern. Nur Disposition und Administration. */
export async function containerSpeichern(formular: FormData) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (benutzer.profil.rolle === "fahrer") redirect("/intern?grund=keine-berechtigung");

  const id = text(formular, "id");
  const daten = {
    nummer: text(formular, "nummer") ?? "",
    externe_id: text(formular, "externe_id"),
    bezeichnung: text(formular, "bezeichnung"),
    strasse: text(formular, "strasse"),
    plz: text(formular, "plz"),
    ort: text(formular, "ort"),
    lat: zahl(formular, "lat"),
    lng: zahl(formular, "lng"),
    typ: text(formular, "typ") ?? "Depotcontainer",
    volumen_liter: zahl(formular, "volumen_liter"),
    leer_abstand_mm: zahl(formular, "leer_abstand_mm"),
    voll_abstand_mm: zahl(formular, "voll_abstand_mm"),
    status: (text(formular, "status") ?? "aktiv") as "aktiv" | "inaktiv" | "defekt" | "entfernt",
    oeffentlich: formular.get("oeffentlich") === "on",
    aufstelldatum: text(formular, "aufstelldatum"),
    bemerkung: text(formular, "bemerkung"),
  };

  if (!daten.nummer) throw new Error("Die Containernummer ist ein Pflichtfeld.");

  const supabase = serverClient();

  if (id) {
    const { error } = await supabase.from("container").update(daten).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath(`/intern/container/${id}`);
    revalidatePath("/intern/container");
    redirect(`/intern/container/${id}`);
  }

  const { data, error } = await supabase.from("container").insert(daten).select("id").single();
  if (error) throw new Error(error.message);

  revalidatePath("/intern/container");
  redirect(`/intern/container/${data.id}`);
}
