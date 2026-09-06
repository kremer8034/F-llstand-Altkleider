import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { kostensaetzeAus, type Kostensaetze } from "@/lib/kosten";
import type {
  Benutzerprofil,
  Container,
  ContainerZustand,
  Standort,
  StandortEntsorgung,
  Tour,
  TourContainer,
  TourFortschritt,
  TourStopp,
} from "@/lib/typen";
import { GRUND_TEXT, type Tourzeile } from "../planungstypen";
import { Tourplanung, type Stoppzeile } from "./Tourplanung";

export const dynamic = "force-dynamic";

/** Optionaler fester Ausgangspunkt der Tour (Einstellung "betriebshof"). */
function betriebshofLesen(werte: Record<string, unknown>) {
  const wert = werte["betriebshof"];
  if (!wert || typeof wert !== "object") return null;

  const { lat, lng, name } = wert as { lat?: unknown; lng?: unknown; name?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return { lat, lng, name: typeof name === "string" ? name : "Betriebshof" };
}

export default async function Tourdetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();

  const { data: tourRoh } = await supabase.from("tour").select("*").eq("id", id).maybeSingle();
  if (!tourRoh) notFound();
  const tour = tourRoh as Tour;

  const [
    stoppAntwort,
    fortschrittAntwort,
    fahrerAntwort,
    planungAntwort,
    alleStandorteAntwort,
    werte,
    benutzer,
    gruppenAntwort,
  ] = await Promise.all([
    supabase.from("tour_stopp").select("*").eq("tour_id", id).order("position"),
    supabase.from("tour_fortschritt").select("*").eq("tour_id", id).maybeSingle(),
    supabase
      .from("benutzerprofil")
      .select("id, name, email, rolle, telefon, aktiv, angelegt_am")
      .eq("aktiv", true)
      .order("name"),
    supabase.rpc("tourenplanung"),
    supabase.from("standort").select("*").eq("aktiv", true).order("name"),
    einstellungen(supabase),
    angemeldeterBenutzer(),
    supabase.from("gruppe").select("id, name").eq("aktiv", true).order("name"),
  ]);

  const stopps = (stoppAntwort.data ?? []) as TourStopp[];
  const fortschritt = fortschrittAntwort.data as TourFortschritt | null;
  const fahrer = (fahrerAntwort.data ?? []) as Benutzerprofil[];
  const faellig = (planungAntwort.data ?? []) as Tourzeile[];
  const alleStandorte = (alleStandorteAntwort.data ?? []) as Standort[];
  const gruppen = (gruppenAntwort.data ?? []) as { id: string; name: string }[];

  const standortIds = stopps.map((s) => s.standort_id);
  const leerId = "00000000-0000-0000-0000-000000000000";

  const [standortAntwort, containerAntwort, entsorgungAntwort, tcAntwort] = await Promise.all([
    // Bewusst ohne Einschraenkung auf die Stopps: die Fuellstaende werden auch
    // fuer die Standorte gebraucht, die noch NICHT auf der Tour stehen. Wer
    // entscheiden soll, was mitkommt, muss sehen, wie voll es dort ist.
    supabase.from("standort_zustand").select("*"),
    supabase
      .from("container")
      .select("id, nummer, bezeichnung, standort_id")
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

  const standortJeId = new Map(alleStandorte.map((s) => [s.id, s]));
  const zustandJeId = new Map(
    ((standortAntwort.data ?? []) as { standort_id: string; [k: string]: unknown }[]).map((z) => [
      z.standort_id,
      z,
    ]),
  );
  const entsorgungJeId = new Map(
    ((entsorgungAntwort.data ?? []) as StandortEntsorgung[]).map((e) => [e.standort_id, e]),
  );
  const tcJeStopp = new Map<string, TourContainer[]>();
  ((tcAntwort.data ?? []) as TourContainer[]).forEach((tc) => {
    const liste = tcJeStopp.get(tc.stopp_id) ?? [];
    liste.push(tc);
    tcJeStopp.set(tc.stopp_id, liste);
  });

  const containerJeStandort = new Map<string, Pick<Container, "id" | "nummer" | "bezeichnung">[]>();
  (
    (containerAntwort.data ?? []) as (Pick<Container, "id" | "nummer" | "bezeichnung"> & {
      standort_id: string;
    })[]
  ).forEach((c) => {
    const liste = containerJeStandort.get(c.standort_id) ?? [];
    liste.push(c);
    containerJeStandort.set(c.standort_id, liste);
  });

  // Füllstände der Container an den Stopps – für „was holen wir hier".
  const containerIds = [...containerJeStandort.values()].flat().map((c) => c.id);
  const { data: czRoh } = containerIds.length
    ? await supabase.from("container_zustand").select("*").in("container_id", containerIds)
    : { data: [] };
  const czJeId = new Map(((czRoh ?? []) as ContainerZustand[]).map((z) => [z.container_id, z]));

  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;
  const saetze: Kostensaetze = kostensaetzeAus(werte);

  const faelligJeId = new Map(faellig.map((z) => [z.standort_id, z]));
  const schonDrauf = new Set(standortIds);

  const zeilen: Stoppzeile[] = stopps.map((s) => {
    const st = standortJeId.get(s.standort_id);
    const z = zustandJeId.get(s.standort_id) as
      | { freie_prozent: number | null; container_gesamt: number; container_ohne_wert: number }
      | undefined;
    const container = containerJeStandort.get(s.standort_id) ?? [];
    const erfasst = tcJeStopp.get(s.id) ?? [];

    return {
      stopp_id: s.id,
      standort_id: s.standort_id,
      position: s.position,
      status: s.status,
      erledigt_am: s.erledigt_am,
      notiz: s.notiz,
      name: st?.name ?? "unbekannter Standort",
      strasse: st?.strasse ?? null,
      plz: st?.plz ?? null,
      ort: st?.ort ?? null,
      zufahrt: st?.zufahrt ?? null,
      lat: st?.lat ?? null,
      lng: st?.lng ?? null,
      freie_prozent: z?.freie_prozent ?? null,
      // Ertrag in Containerfuellungen: die gemessenen Fuellstaende aufaddiert.
      // Genauer als der Mittelwert des Platzes, weil hier die Einzelwerte
      // ohnehin vorliegen. Ungemessene zaehlen nicht mit - sie sind unbekannt.
      ertrag_fuellungen: fuellungenAus(container.map((c) => czJeId.get(c.id)?.fuellstand_prozent ?? null)),
      container_gesamt: container.length,
      grund: faelligJeId.get(s.standort_id)?.grund ?? null,
      abholung_vereinbart: entsorgungJeId.get(s.standort_id)?.abholung_vereinbart ?? false,
      entsorger_name: entsorgungJeId.get(s.standort_id)?.entsorger_name ?? null,
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

  /**
   * Ertrag in Containerfüllungen: drei Container zu 80 % sind 2,4 Füllungen.
   * Null Messwerte heißt null - nicht etwa "voll".
   */
  function fuellungenAus(werteProzent: (number | null)[]): number | null {
    const gemessen = werteProzent.filter((w): w is number => w !== null);
    if (gemessen.length === 0) return null;
    return gemessen.reduce((summe, w) => summe + w / 100, 0);
  }

  /** Gefüllter Anteil eines Standorts – aus der freien Restkapazität. */
  function gefuelltProzent(standortId: string): number | null {
    const z = zustandJeId.get(standortId) as { freie_prozent: number | null } | undefined;
    return z?.freie_prozent == null ? null : Math.round(100 - z.freie_prozent);
  }

  // Kandidaten zum Aufnehmen: erst das Fällige, dann alles Übrige.
  //
  // Jeder Kandidat trägt seinen Füllstand mit. „Pflicht" allein sagt nur, dass
  // die Rechnung ihn ausgewählt hat – nicht, wie dringend es ist und ob sich
  // der Umweg lohnt. Mit dem Balken daneben entscheidet sich das im Blick.
  const kandidaten = [
    ...faellig
      .filter((z) => !schonDrauf.has(z.standort_id))
      .map((z) => ({
        id: z.standort_id,
        name: z.name,
        ort: z.ort,
        hinweis:
          z.zustand === "pflicht"
            ? (GRUND_TEXT[z.grund] ?? "muss mit")
            : "könnte man mitnehmen",
        pflicht: z.zustand === "pflicht",
        fuellstand_prozent:
          z.freie_prozent == null ? gefuelltProzent(z.standort_id) : Math.round(100 - Number(z.freie_prozent)),
        ertrag_fuellungen:
          z.belegt_prozent === null
            ? null
            : ((z.container_gesamt - z.container_ohne_wert) * Number(z.belegt_prozent)) / 100,
        container_gesamt: z.container_gesamt,
      })),
    ...alleStandorte
      .filter((s) => !schonDrauf.has(s.id) && !faelligJeId.has(s.id))
      .map((s) => {
        const z = zustandJeId.get(s.id) as
          | { belegt_prozent: number | null; container_gesamt: number; container_ohne_wert: number }
          | undefined;
        return {
          id: s.id,
          name: s.name,
          ort: s.ort,
          hinweis: null,
          pflicht: false,
          fuellstand_prozent: gefuelltProzent(s.id),
          ertrag_fuellungen:
            z?.belegt_prozent == null
              ? null
              : ((z.container_gesamt - z.container_ohne_wert) * Number(z.belegt_prozent)) / 100,
          container_gesamt: z?.container_gesamt ?? 0,
        };
      }),
  ];

  return (
    <div className="space-y-4">
      <Link href="/intern/touren" className="text-sm text-ink-3 underline underline-offset-2">
        ← Alle Touren
      </Link>

      <Tourplanung
        tour={tour}
        fortschritt={fortschritt}
        zeilen={zeilen}
        kandidaten={kandidaten}
        fahrer={fahrer
          .filter((f) => f.rolle === "fahrer" || f.rolle === "dispo" || f.rolle === "admin")
          .map((f) => ({ id: f.id, name: f.name || (f.email ?? "ohne Namen"), rolle: f.rolle }))}
        gruppen={gruppen}
        betriebshof={betriebshofLesen(werte)}
        saetze={saetze}
        bearbeiten={bearbeiten}
      />
    </div>
  );
}
