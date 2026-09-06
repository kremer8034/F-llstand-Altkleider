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

interface Platzdaten {
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * Ein freies Kuerzel besorgen.
 *
 * Jeder Platz braucht eines - daraus entstehen die Containernummern. Die
 * Datenbank kennt die bereits vergebenen und findet ein freies; hier steht nur
 * der Aufruf, damit ihn nicht drei Stellen einzeln nachbauen.
 */
async function freiesKuerzel(
  supabase: Awaited<ReturnType<typeof serverClient>>,
  name: string,
  id?: string | null,
): Promise<string | null> {
  const { data } = await supabase.rpc("standort_kuerzel_vorschlag", {
    p_name: name,
    p_id: id ?? null,
  });
  return typeof data === "string" ? data : null;
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
    kuerzel: text(formular, "kuerzel")?.toUpperCase() ?? null,
    zufahrt: text(formular, "zufahrt"),
    bemerkung: text(formular, "bemerkung"),
    entsorger_id: text(formular, "entsorger_id"),
    gruppe_id: text(formular, "gruppe_id"),
    aktiv: formular.get("aktiv") === "on",
  };

  if (!daten.name) throw new Error("Der Name des Standorts ist ein Pflichtfeld.");

  const supabase = await serverClient();

  // Ohne Kuerzel kein Nummernstamm fuer die Container. Leer gelassen heisst
  // nicht "keins", sondern "schlag mir eins vor" - die Datenbank kennt die
  // bereits vergebenen und findet ein freies.
  if (!daten.kuerzel) daten.kuerzel = await freiesKuerzel(supabase, daten.name, id);

  if (id) {
    const { error } = await supabase.from("standort").update(daten).eq("id", id);
    if (error) throw new Error(error.message);
    alleSeitenNeu(id);
    redirect(`/intern/standorte/${id}`);
  }

  const { data, error } = await supabase.from("standort").insert(daten).select("id").single();
  if (error) throw new Error(error.message);

  // Beim Anlegen steht die Containerzahl gleich im Formular - der Platz ist
  // damit in einem Zug fertig statt leer.
  const anzahl = zahl(formular, "anzahl_container");
  if (anzahl !== null && anzahl > 0) {
    const { error: anzahlFehler } = await supabase.rpc("standort_container_setzen", {
      p_standort_id: data.id,
      p_anzahl: Math.round(anzahl),
    });
    if (anzahlFehler) throw new Error(anzahlFehler.message);
  }

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
 * Wie viele Container stehen an diesem Platz?
 *
 * Bisher fuehrte der Weg ueber "Neuer Container", ein leeres Formular und das
 * Abtippen von Adresse und Koordinaten - drei Schritte fuer einen Vorgang, bei
 * dem die Haelfte der Angaben bereits danebenstand. Seit 0022 traegt der
 * Container davon nichts mehr, und damit bleibt als Angabe genau eine uebrig:
 * ihre Zahl.
 *
 * Die Arbeit macht public.standort_container_setzen - Nummernvergabe aus dem
 * Kuerzel, und beim Verringern die Unterscheidung zwischen "hat nie etwas
 * getan" (loeschen) und "hat Geschichte" (stilllegen). Das gehoert in die
 * Datenbank, weil dort die acht Fremdschluessel haengen, an denen sich
 * entscheidet, was ein Loeschen mitreisst.
 */
export async function containerAnzahlSetzen(formular: FormData) {
  await berechtigt();

  const standortId = text(formular, "standort_id");
  const anzahl = zahl(formular, "anzahl");
  if (!standortId) return;
  if (anzahl === null || anzahl < 0 || anzahl > 50) {
    throw new Error("Die Anzahl muss zwischen 0 und 50 liegen.");
  }

  const supabase = await serverClient();
  const { error } = await supabase.rpc("standort_container_setzen", {
    p_standort_id: standortId,
    p_anzahl: Math.round(anzahl),
  });

  if (error) throw new Error(error.message);

  alleSeitenNeu(standortId);
  revalidatePath("/intern/karte");
}

/**
 * Container vom Standort loesen.
 *
 * Er bleibt nicht ohne Platz zurueck - das ginge seit 0022 auch gar nicht mehr,
 * standort_id ist Pflicht -, sondern bekommt einen eigenen. Anschrift und
 * Koordinaten kommen vom bisherigen Platz: der Container selbst traegt keine
 * mehr, und "irgendwo im Nirgendwo" waere fuer die Tourenplanung schlechter
 * als "vorerst dort, wo er stand".
 *
 * Hier stand bis zur Oberflaechendurchsicht ein `.select` auf die geloeschten
 * Containerspalten - die Aktion brach mit einem Datenbankfehler ab. TypeScript
 * konnte das nicht sehen: fuer den Compiler ist die Spaltenliste eine
 * Zeichenkette.
 */
export async function containerLoesen(formular: FormData) {
  await berechtigt();

  const containerId = text(formular, "container_id");
  const bisher = text(formular, "standort_id");
  if (!containerId) return;

  const supabase = await serverClient();

  const { data: container } = await supabase
    .from("container")
    .select("nummer, bezeichnung, standort:standort_id (name, strasse, plz, ort, lat, lng)")
    .eq("id", containerId)
    .maybeSingle();

  if (!container) return;

  const alter = (container as unknown as { standort: Platzdaten | null }).standort;
  const name = container.bezeichnung?.trim() || (container.nummer as string);

  const { data: standort, error: fehlerNeu } = await supabase
    .from("standort")
    .insert({
      name,
      kuerzel: await freiesKuerzel(supabase, name),
      strasse: alter?.strasse ?? null,
      plz: alter?.plz ?? null,
      ort: alter?.ort ?? null,
      lat: alter?.lat ?? null,
      lng: alter?.lng ?? null,
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
