import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import type {
  Container,
  ContainerZustand,
  Standort,
  StandortEntsorgung,
  Tour,
  TourContainer,
  TourStopp,
} from "@/lib/typen";
import { Tourablauf, type Fahrstopp } from "./Tourablauf";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tour fahren" };

export default async function FahrerTour({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();
  const benutzer = await angemeldeterBenutzer();

  const { data: tourRoh } = await supabase.from("tour").select("*").eq("id", id).maybeSingle();
  if (!tourRoh) notFound();
  const tour = tourRoh as Tour;

  const stoppAntwort = await supabase
    .from("tour_stopp")
    .select("*")
    .eq("tour_id", id)
    .order("position");
  const stopps = (stoppAntwort.data ?? []) as TourStopp[];

  // Eine leere Stoppliste heißt "Tour fertig" oder "noch nichts geplant".
  // Kommt sie aus einem Abfragefehler, sagt die Ansicht dem Fahrpersonal
  // beides fälschlich. Der Unterschied muss sichtbar bleiben.
  if (stoppAntwort.error) console.error("Tourstopps nicht abrufbar:", stoppAntwort.error);

  const standortIds = stopps.map((s) => s.standort_id);
  const leerId = "00000000-0000-0000-0000-000000000000";

  const [standortAntwort, containerAntwort, entsorgungAntwort, tcAntwort] = await Promise.all([
    supabase.from("standort").select("*").in("id", standortIds.length ? standortIds : [leerId]),
    supabase
      .from("container")
      .select("id, nummer, bezeichnung, standort_id, volumen_liter")
      .in("standort_id", standortIds.length ? standortIds : [leerId])
      .eq("status", "aktiv")
      .order("nummer"),
    supabase
      .from("standort_entsorgung")
      .select("*")
      .in("standort_id", standortIds.length ? standortIds : [leerId]),
    supabase
      .from("tour_container")
      .select("*")
      .in("stopp_id", stopps.length ? stopps.map((s) => s.id) : [leerId]),
  ]);

  const standortJeId = new Map(((standortAntwort.data ?? []) as Standort[]).map((s) => [s.id, s]));
  const entsorgungJeId = new Map(
    ((entsorgungAntwort.data ?? []) as StandortEntsorgung[]).map((e) => [e.standort_id, e]),
  );

  const containerJeStandort = new Map<
    string,
    (Pick<Container, "id" | "nummer" | "bezeichnung" | "volumen_liter"> & { standort_id: string })[]
  >();
  (
    (containerAntwort.data ?? []) as (Pick<
      Container,
      "id" | "nummer" | "bezeichnung" | "volumen_liter"
    > & { standort_id: string })[]
  ).forEach((c) => {
    const liste = containerJeStandort.get(c.standort_id) ?? [];
    liste.push(c);
    containerJeStandort.set(c.standort_id, liste);
  });

  const containerIds = [...containerJeStandort.values()].flat().map((c) => c.id);
  const { data: czRoh } = containerIds.length
    ? await supabase.from("container_zustand").select("*").in("container_id", containerIds)
    : { data: [] };
  const czJeId = new Map(((czRoh ?? []) as ContainerZustand[]).map((z) => [z.container_id, z]));

  const tcJeStopp = new Map<string, TourContainer[]>();
  ((tcAntwort.data ?? []) as TourContainer[]).forEach((tc) => {
    const liste = tcJeStopp.get(tc.stopp_id) ?? [];
    liste.push(tc);
    tcJeStopp.set(tc.stopp_id, liste);
  });

  const fahrstopps: Fahrstopp[] = stopps.map((s) => {
    const st = standortJeId.get(s.standort_id);
    const container = containerJeStandort.get(s.standort_id) ?? [];
    const erfasst = tcJeStopp.get(s.id) ?? [];

    return {
      stopp_id: s.id,
      standort_id: s.standort_id,
      position: s.position,
      status: s.status,
      notiz: s.notiz,
      name: st?.name ?? "unbekannter Standort",
      strasse: st?.strasse ?? null,
      plz: st?.plz ?? null,
      ort: st?.ort ?? null,
      zufahrt: st?.zufahrt ?? null,
      bemerkung: st?.bemerkung ?? null,
      lat: st?.lat ?? null,
      lng: st?.lng ?? null,
      entsorgung: entsorgungJeId.get(s.standort_id) ?? null,
      container: container.map((c) => {
        const tc = erfasst.find((e) => e.container_id === c.id);
        return {
          id: c.id,
          nummer: c.nummer,
          bezeichnung: c.bezeichnung,
          fuellstand_prozent: czJeId.get(c.id)?.fuellstand_prozent ?? null,
          geleert: tc ? tc.geleert : null,
          grund: tc?.grund ?? null,
        };
      }),
    };
  });

  const meine = tour.fahrer_id === benutzer?.id;
  const plant = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  // Eine fremde Tour darf die Disposition ansehen, aber nicht abarbeiten:
  // die Datenbank ließe es ohnehin nicht zu (tour_stopp_abschliessen prüft
  // den Fahrer), und ein Knopf, der beim Drücken einen Fehler wirft, ist
  // schlimmer als keiner.
  return (
    <div className="space-y-4">
      <Link href="/fahrer" className="text-sm text-ink-3 underline underline-offset-2">
        ← Meine Touren
      </Link>

      {!meine && (
        <div
          className="karte-flaeche border-l-4 p-3 text-sm"
          style={{ borderLeftColor: "var(--warnung)" }}
        >
          Diese Tour ist {tour.fahrer_id ? "jemand anderem" : "niemandem"} zugewiesen. Sie sehen sie
          nur mit.
        </div>
      )}

      <Tourablauf
        tour={tour}
        stopps={fahrstopps}
        darfFahren={meine}
        darfPlanen={plant}
        stoppsGestoert={Boolean(stoppAntwort.error)}
      />
    </div>
  );
}
