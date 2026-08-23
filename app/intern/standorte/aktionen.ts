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

function zahl(formular: FormData, name: string): number | null {
  const wert = text(formular, name);
  if (wert === null) return null;
  const n = Number(wert.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function berechtigt() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (!darfBearbeiten(benutzer.profil.rolle)) redirect("/intern?grund=keine-berechtigung");
}

function alleSeitenNeu(id?: string) {
  revalidatePath("/intern/standorte");
  revalidatePath("/intern/container");
  revalidatePath("/intern/touren");
  if (id) revalidatePath(`/intern/standorte/${id}`);
}

/** Anlegen und Bearbeiten in einem - Unterschied ist nur die id. */
export async function standortSpeichern(formular: FormData) {
  await berechtigt();

  const id = text(formular, "id");
  const daten = {
    name: text(formular, "name") ?? "",
    strasse: text(formular, "strasse"),
    plz: text(formular, "plz"),
    ort: text(formular, "ort"),
    lat: zahl(formular, "lat"),
    lng: zahl(formular, "lng"),
    zufahrt: text(formular, "zufahrt"),
    bemerkung: text(formular, "bemerkung"),
    aktiv: formular.get("aktiv") === "on",
  };

  if (!daten.name) throw new Error("Der Name des Standorts ist ein Pflichtfeld.");

  const supabase = await serverClient();

  if (id) {
    const { error } = await supabase.from("standort").update(daten).eq("id", id);
    if (error) throw new Error(error.message);
    alleSeitenNeu(id);
    redirect(`/intern/standorte/${id}`);
  }

  const { data, error } = await supabase.from("standort").insert(daten).select("id").single();
  if (error) throw new Error(error.message);

  alleSeitenNeu();
  redirect(`/intern/standorte/${data.id}`);
}

/** Container diesem Standort zuordnen. */
export async function containerZuordnen(formular: FormData) {
  await berechtigt();

  const standortId = text(formular, "standort_id");
  const containerIds = formular.getAll("container_id").filter((w): w is string => typeof w === "string");
  if (!standortId || containerIds.length === 0) return;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("container")
    .update({ standort_id: standortId })
    .in("id", containerIds);

  if (error) throw new Error(error.message);
  alleSeitenNeu(standortId);
}

/**
 * Container vom Standort loesen.
 *
 * Er bleibt nicht ohne Stopp zurueck, sondern bekommt einen eigenen Standort -
 * sonst faellt er aus der Tourenplanung heraus, ohne dass es jemand merkt.
 */
export async function containerLoesen(formular: FormData) {
  await berechtigt();

  const containerId = text(formular, "container_id");
  const bisher = text(formular, "standort_id");
  if (!containerId) return;

  const supabase = await serverClient();

  const { data: container } = await supabase
    .from("container")
    .select("nummer, bezeichnung, strasse, plz, ort, lat, lng")
    .eq("id", containerId)
    .maybeSingle();

  if (!container) return;

  const { data: standort, error: fehlerNeu } = await supabase
    .from("standort")
    .insert({
      name: container.bezeichnung?.trim() || container.nummer,
      strasse: container.strasse,
      plz: container.plz,
      ort: container.ort,
      lat: container.lat,
      lng: container.lng,
    })
    .select("id")
    .single();

  if (fehlerNeu) throw new Error(fehlerNeu.message);

  const { error } = await supabase
    .from("container")
    .update({ standort_id: standort.id })
    .eq("id", containerId);

  if (error) throw new Error(error.message);
  alleSeitenNeu(bisher ?? undefined);
  revalidatePath(`/intern/standorte/${standort.id}`);
}

/**
 * Zwei Standorte zusammenfuehren: alle Container wandern, der leere wird
 * geloescht. Der haeufigste Handgriff beim Aufraeumen des Ausgangszustands,
 * in dem jeder Container noch seinen eigenen Standort hat.
 */
export async function standorteZusammenfuehren(formular: FormData) {
  await berechtigt();

  const zielId = text(formular, "ziel_id");
  const quelleId = text(formular, "quelle_id");
  if (!zielId || !quelleId || zielId === quelleId) return;

  const supabase = await serverClient();

  const { error: fehlerUmzug } = await supabase
    .from("container")
    .update({ standort_id: zielId })
    .eq("standort_id", quelleId);

  if (fehlerUmzug) throw new Error(fehlerUmzug.message);

  const { error } = await supabase.from("standort").delete().eq("id", quelleId);
  if (error) throw new Error(error.message);

  alleSeitenNeu(zielId);
  redirect(`/intern/standorte/${zielId}`);
}

/**
 * Container ohne Standort auffangen.
 *
 * Die Planung geht vom Standort aus (`standort_zustand` liest `from standort`).
 * Ein Container ohne Zuordnung fällt damit lautlos aus der Tourenplanung –
 * er hat keinen Stopp, an dem er hängt. Migration 0011 hat das für den
 * Bestand erledigt; neu angelegte oder ohne Standortspalte importierte
 * Container können erneut in diese Lücke fallen.
 *
 * Diese Aktion stellt denselben neutralen Ausgangszustand her: je Container
 * ein eigener Standort, **keine** Gruppierung. Wer zusammengehört, entscheidet
 * weiterhin ein Mensch – hier wird nur sichergestellt, dass kein Container
 * unsichtbar wird.
 */
export async function standorteNachziehen() {
  await berechtigt();

  const supabase = await serverClient();
  const { data: offene, error: leseFehler } = await supabase
    .from("container")
    .select("id, nummer, bezeichnung, strasse, plz, ort, lat, lng")
    .is("standort_id", null)
    .order("nummer")
    .limit(1000);

  if (leseFehler) throw new Error(leseFehler.message);
  if (!offene || offene.length === 0) return;

  for (const c of offene) {
    const name = (c.bezeichnung ?? "").trim() || c.nummer;
    const { data: standort, error: anlegeFehler } = await supabase
      .from("standort")
      .insert({
        name,
        strasse: c.strasse,
        plz: c.plz,
        ort: c.ort,
        lat: c.lat,
        lng: c.lng,
      })
      .select("id")
      .single();

    if (anlegeFehler) throw new Error(anlegeFehler.message);

    const { error: zuordnungsFehler } = await supabase
      .from("container")
      .update({ standort_id: standort.id })
      .eq("id", c.id);

    if (zuordnungsFehler) throw new Error(zuordnungsFehler.message);
  }

  alleSeitenNeu();
}
