"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { routePlanen, type Ort } from "@/lib/route";
import { heute } from "@/lib/zeit";

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
  return benutzer;
}

function alleSeitenNeu(tourId?: string) {
  revalidatePath("/intern/touren");
  revalidatePath("/intern");
  revalidatePath("/fahrer");
  if (tourId) {
    revalidatePath(`/intern/touren/${tourId}`);
    revalidatePath(`/fahrer/${tourId}`);
  }
}

/**
 * Tour anlegen - entweder leer oder aus einer Regeltour.
 *
 * Aus einer Regeltour heraus uebernimmt die Datenbankfunktion die Standorte
 * samt Reihenfolge (tour_aus_route in 0015_touren.sql). Das gehoert dorthin
 * und nicht hierher: die Uebernahme ist ein Vorgang, der ganz oder gar nicht
 * gelten soll.
 */
export async function tourAnlegen(formular: FormData) {
  const benutzer = await berechtigt();
  const supabase = await serverClient();

  const routeId = text(formular, "route_id");
  const datum = text(formular, "datum") ?? heute();
  const fahrerId = text(formular, "fahrer_id");

  if (routeId) {
    const { data, error } = await supabase.rpc("tour_aus_route", {
      p_route_id: routeId,
      p_datum: datum,
      p_fahrer_id: fahrerId,
    });
    if (error) throw new Error(error.message);
    alleSeitenNeu();
    redirect(`/intern/touren/${data as string}`);
  }

  const { data, error } = await supabase
    .from("tour")
    .insert({
      name: text(formular, "name"),
      datum,
      fahrer_id: fahrerId,
      gruppe_id: text(formular, "gruppe_id"),
      angelegt_von: benutzer.id,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  alleSeitenNeu();
  redirect(`/intern/touren/${data.id}`);
}

/**
 * Name, Tag, Fahrer, Bereitschaft und Bemerkung aendern.
 *
 * Das Ergebnis wird ausgewertet, nicht nur der Fehler. Ohne `.select()` meldet
 * PostgREST auch dann Erfolg, wenn die Zugriffsregeln die Zeile gar nicht
 * herausgeben - die Aenderung waere lautlos verpufft, und die Seite zeigte
 * anschliessend wieder den alten Stand, ohne dass jemand erfaehrt, warum.
 * Genau so etwas sucht man dann an der falschen Stelle.
 */
export async function tourAendern(formular: FormData) {
  await berechtigt();

  const id = text(formular, "id");
  if (!id) return;

  const daten: Record<string, unknown> = {
    name: text(formular, "name"),
    fahrer_id: text(formular, "fahrer_id"),
    gruppe_id: text(formular, "gruppe_id"),
    bemerkung: text(formular, "bemerkung"),
  };
  const datum = text(formular, "datum");
  if (datum) daten.datum = datum;

  const supabase = await serverClient();
  const { data, error } = await supabase.from("tour").update(daten).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error(
      "Die Tour konnte nicht geändert werden. Vermutlich gehört sie einer Bereitschaft, " +
        "für die dieser Zugang keine Rechte hat.",
    );
  }

  alleSeitenNeu(id);
}

export async function tourLoeschen(formular: FormData) {
  await berechtigt();

  const id = text(formular, "id");
  if (!id) return;

  const supabase = await serverClient();
  const { error } = await supabase.from("tour").delete().eq("id", id);
  if (error) throw new Error(error.message);

  alleSeitenNeu();
  redirect("/intern/touren");
}

/**
 * Stopps aufnehmen.
 *
 * Neue Stopps kommen ans Ende. Die Reihenfolge macht danach
 * `reihenfolgeNeuBerechnen()` - beim Einfuegen zu sortieren waere eine
 * Entscheidung, die die Disposition nicht getroffen hat.
 */
export async function stoppsHinzufuegen(formular: FormData) {
  await berechtigt();

  const tourId = text(formular, "tour_id");
  const standortIds = formular
    .getAll("standort_id")
    .filter((w): w is string => typeof w === "string" && w !== "");

  if (!tourId || standortIds.length === 0) return;

  const supabase = await serverClient();

  const { data: vorhanden } = await supabase
    .from("tour_stopp")
    .select("standort_id, position")
    .eq("tour_id", tourId);

  const schon = new Set((vorhanden ?? []).map((s) => s.standort_id as string));
  const hoechste = Math.max(0, ...(vorhanden ?? []).map((s) => (s.position as number) ?? 0));

  const neue = standortIds
    .filter((id) => !schon.has(id))
    .map((standort_id, i) => ({ tour_id: tourId, standort_id, position: hoechste + i + 1 }));

  if (neue.length === 0) return;

  const { error } = await supabase.from("tour_stopp").insert(neue);
  if (error) throw new Error(error.message);

  alleSeitenNeu(tourId);
}

export async function stoppEntfernen(formular: FormData) {
  await berechtigt();

  const stoppId = text(formular, "stopp_id");
  const tourId = text(formular, "tour_id");
  if (!stoppId) return;

  const supabase = await serverClient();
  const { error } = await supabase.from("tour_stopp").delete().eq("id", stoppId);
  if (error) throw new Error(error.message);

  alleSeitenNeu(tourId ?? undefined);
}

/**
 * Reihenfolge nach kuerzester Fahrtstrecke.
 *
 * Dieselbe Rechnung wie bisher in der Tourenansicht (lib/route.ts) - nur wird
 * das Ergebnis jetzt gespeichert statt im Browser zu leben. Das ist der
 * eigentliche Unterschied zur alten Seite: der Fahrer bekommt genau die
 * Reihenfolge, die die Disposition gesehen hat.
 *
 * Erledigte Stopps bleiben, wo sie sind. Wer schon dort war, soll nicht
 * plotzlich weiter unten stehen.
 */
export async function reihenfolgeNeuBerechnen(formular: FormData) {
  await berechtigt();

  const tourId = text(formular, "tour_id");
  if (!tourId) return;

  const supabase = await serverClient();

  const [stoppAntwort, hofAntwort] = await Promise.all([
    supabase
      .from("tour_stopp")
      .select("id, standort_id, position, status")
      .eq("tour_id", tourId)
      .order("position"),
    supabase.from("einstellung").select("wert").eq("schluessel", "betriebshof").maybeSingle(),
  ]);

  const stopps = (stoppAntwort.data ?? []) as {
    id: string;
    standort_id: string;
    position: number;
    status: string;
  }[];
  if (stopps.length < 2) return;

  const { data: orte } = await supabase
    .from("standort")
    .select("id, lat, lng")
    .in("id", stopps.map((s) => s.standort_id));

  const ortJeId = new Map(
    ((orte ?? []) as { id: string; lat: number | null; lng: number | null }[]).map((o) => [o.id, o]),
  );

  const hofWert = hofAntwort.data?.wert as { lat?: number; lng?: number } | null | undefined;
  const start: Ort | null =
    hofWert && typeof hofWert.lat === "number" && typeof hofWert.lng === "number"
      ? { lat: hofWert.lat, lng: hofWert.lng }
      : null;

  const erledigt = stopps.filter((s) => s.status !== "offen");
  const offen = stopps.filter((s) => s.status === "offen");

  // Ohne Koordinaten laesst sich nichts planen - diese Stopps behalten ihre
  // bisherige Folge und haengen sich hinten an.
  const mitOrt = offen.filter((s) => {
    const o = ortJeId.get(s.standort_id);
    return o?.lat != null && o?.lng != null;
  });
  const ohneOrt = offen.filter((s) => !mitOrt.includes(s));

  if (mitOrt.length < 2) return;

  const geplant = routePlanen(
    mitOrt.map((s) => {
      const o = ortJeId.get(s.standort_id)!;
      return { lat: o.lat as number, lng: o.lng as number };
    }),
    start,
    false,
  );

  const folge = [
    ...erledigt,
    ...geplant.reihenfolge.map((i) => mitOrt[i]),
    ...ohneOrt,
  ];

  // Einzeln fortschreiben: ein Upsert ueber tour_stopp wuerde die uebrigen
  // Spalten mitschreiben, und ein Zwischenstand mit doppelter Position ist
  // erlaubt - position traegt keine Eindeutigkeitsbedingung.
  for (let i = 0; i < folge.length; i++) {
    const { error } = await supabase
      .from("tour_stopp")
      .update({ position: i + 1 })
      .eq("id", folge[i].id);
    if (error) throw new Error(error.message);
  }

  alleSeitenNeu(tourId);
}

/** Einen Stopp um einen Platz nach oben oder unten schieben. */
export async function stoppVerschieben(formular: FormData) {
  await berechtigt();

  const tourId = text(formular, "tour_id");
  const stoppId = text(formular, "stopp_id");
  const richtung = text(formular, "richtung");
  if (!tourId || !stoppId || (richtung !== "hoch" && richtung !== "runter")) return;

  const supabase = await serverClient();
  const { data } = await supabase
    .from("tour_stopp")
    .select("id, position")
    .eq("tour_id", tourId)
    .order("position");

  const stopps = (data ?? []) as { id: string; position: number }[];
  const index = stopps.findIndex((s) => s.id === stoppId);
  if (index < 0) return;

  const ziel = richtung === "hoch" ? index - 1 : index + 1;
  if (ziel < 0 || ziel >= stopps.length) return;

  [stopps[index], stopps[ziel]] = [stopps[ziel], stopps[index]];

  for (let i = 0; i < stopps.length; i++) {
    const { error } = await supabase
      .from("tour_stopp")
      .update({ position: i + 1 })
      .eq("id", stopps[i].id);
    if (error) throw new Error(error.message);
  }

  alleSeitenNeu(tourId);
}

/** Tour beenden - auch die Disposition darf das, nicht nur das Fahrpersonal. */
export async function tourBeenden(formular: FormData) {
  await berechtigt();

  const id = text(formular, "id");
  if (!id) return;

  const supabase = await serverClient();
  const { error } = await supabase.rpc("tour_abschliessen", {
    p_tour_id: id,
    p_abgebrochen: formular.get("abgebrochen") === "on",
    p_bemerkung: text(formular, "bemerkung"),
  });
  if (error) throw new Error(error.message);

  alleSeitenNeu(id);
}
