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
  revalidatePath("/intern/routen");
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
    entsorger_id: text(formular, "entsorger_id"),
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
 * Standorte zusammenfuehren: alle Container wandern zum Ziel, die leeren
 * Standorte werden geloescht. Der haeufigste Handgriff beim Aufraeumen des
 * Ausgangszustands, in dem jeder Container noch seinen eigenen Standort hat.
 *
 * Nimmt mehrere Quellen auf einmal. Ein Wertstoffhof mit sieben Containern
 * bedeutete sonst sechs Durchgaenge durch dasselbe Formular, jeder mit
 * Neuladen der Seite.
 */
export async function standorteZusammenfuehren(formular: FormData) {
  await berechtigt();

  const zielId = text(formular, "ziel_id");
  const quellen = formular
    .getAll("quelle_id")
    .filter((w): w is string => typeof w === "string" && w !== "" && w !== zielId);

  if (!zielId || quellen.length === 0) return;

  const supabase = await serverClient();

  const { error: fehlerUmzug } = await supabase
    .from("container")
    .update({ standort_id: zielId })
    .in("standort_id", quellen);

  if (fehlerUmzug) throw new Error(fehlerUmzug.message);

  // Die Zuordnungen zu Regeltouren wandern nicht mit: welche Touren den
  // zusammengefuehrten Platz anfahren sollen, ist eine Planungsentscheidung
  // und keine Folge des Zusammenlegens. Sie verschwinden mit dem Standort
  // (on delete cascade), und der Zielstandort behaelt seine eigenen.
  const { error } = await supabase.from("standort").delete().in("id", quellen);
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

/**
 * Regeltouren dieses Standorts festlegen.
 *
 * Bisher ging die Zuordnung nur von der Routenseite aus: wer wissen wollte,
 * auf welchen Touren ein Standort liegt, musste jede Route einzeln oeffnen.
 * Hier geht es andersherum - und weil ein Standort ausdruecklich auf mehreren
 * Regeltouren liegen darf (haeufig angefahrene Plaetze brauchen das), ist es
 * eine Mehrfachauswahl.
 *
 * Gesetzt wird der Zustand als Ganzes, nicht als Folge von Einzelschritten:
 * das Formular schickt alle angehakten Routen, alles andere wird entfernt.
 * Damit gibt es keinen Zwischenstand, in dem eine Zuordnung doppelt oder gar
 * nicht existiert.
 */
export async function regeltourenSetzen(formular: FormData) {
  await berechtigt();

  const standortId = text(formular, "standort_id");
  if (!standortId) return;

  const gewuenscht = formular
    .getAll("route_id")
    .filter((w): w is string => typeof w === "string" && w !== "");

  const supabase = await serverClient();

  const { data: bisherRoh, error: leseFehler } = await supabase
    .from("route_standort")
    .select("route_id")
    .eq("standort_id", standortId);

  if (leseFehler) throw new Error(leseFehler.message);

  const bisher = new Set((bisherRoh ?? []).map((z) => z.route_id as string));
  const soll = new Set(gewuenscht);

  const hinzu = gewuenscht.filter((id) => !bisher.has(id));
  const weg = [...bisher].filter((id) => !soll.has(id));

  if (hinzu.length > 0) {
    const { error } = await supabase
      .from("route_standort")
      .upsert(
        hinzu.map((route_id) => ({ route_id, standort_id: standortId })),
        { onConflict: "route_id,standort_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
  }

  if (weg.length > 0) {
    const { error } = await supabase
      .from("route_standort")
      .delete()
      .eq("standort_id", standortId)
      .in("route_id", weg);
    if (error) throw new Error(error.message);
  }

  alleSeitenNeu(standortId);
}

/**
 * Zustaendigen Bauhof am Standort hinterlegen.
 *
 * Leerer Wert bedeutet ausdruecklich "keine Absprache" - dann nimmt das
 * Fahrpersonal den Fremdmuell mit. Das ist kein fehlender Wert, sondern eine
 * Aussage, und die Fahreransicht sagt sie auch so.
 */
export async function entsorgerZuordnen(formular: FormData) {
  await berechtigt();

  const standortId = text(formular, "standort_id");
  if (!standortId) return;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("standort")
    .update({ entsorger_id: text(formular, "entsorger_id") })
    .eq("id", standortId);

  if (error) throw new Error(error.message);
  alleSeitenNeu(standortId);
}

/**
 * Denselben Bauhof allen Standorten einer Gemeinde zuordnen.
 *
 * Der eigentliche Grund fuer die getrennte Entsorgertabelle: die Absprache
 * gilt fuer das Gemeindegebiet, nicht fuer den einzelnen Platz. Wer sie
 * dreissig Mal einzeln eintragen muesste, traegt sie irgendwann nicht mehr
 * ein - und das Fahrpersonal steht vor dem Container und weiss nicht, wen es
 * anrufen soll.
 *
 * Ueberschrieben wird nur, was noch leer ist. Eine bewusst abweichende
 * Zuordnung an einem einzelnen Standort bleibt bestehen.
 */
export async function entsorgerAufGemeindeAnwenden(formular: FormData) {
  await berechtigt();

  const entsorgerId = text(formular, "entsorger_id");
  const gemeinde = text(formular, "gemeinde");
  if (!entsorgerId || !gemeinde) return;

  const supabase = await serverClient();
  const { error } = await supabase
    .from("standort")
    .update({ entsorger_id: entsorgerId })
    .eq("ort", gemeinde)
    .is("entsorger_id", null);

  if (error) throw new Error(error.message);

  revalidatePath("/intern/standorte");
  revalidatePath("/intern/entsorger");
}
