import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { naechsterTermin, rhythmusText } from "@/lib/wochentage";
import type { Benutzerprofil, Route, TourFortschritt } from "@/lib/typen";
import { Tagesuebersicht } from "./Tagesuebersicht";
import type { Tourzeile } from "./planungstypen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Touren" };

/** Heute im lokalen Kalender - nicht in UTC, sonst kippt der Tag am Abend. */
function heute(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default async function TourenSeite({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const { tag } = await searchParams;
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(tag ?? "") ? (tag as string) : heute();

  const supabase = await serverClient();
  const [tourAntwort, planungAntwort, routenAntwort, fahrerAntwort, werte, benutzer] =
    await Promise.all([
      supabase.from("tour_fortschritt").select("*").eq("datum", datum).order("name"),
      supabase.rpc("tourenplanung"),
      supabase.from("route").select("*").eq("aktiv", true).order("name"),
      supabase
        .from("benutzerprofil")
        .select("id, name, email, rolle, telefon, aktiv, angelegt_am")
        .eq("aktiv", true)
        .in("rolle", ["fahrer", "dispo", "admin"])
        .order("name"),
      einstellungen(supabase),
      angemeldeterBenutzer(),
    ]);

  const touren = (tourAntwort.data ?? []) as TourFortschritt[];

  // Welche Standorte stehen an diesem Tag schon auf irgendeiner Tour? Bewusst
  // eine zweite Abfrage ueber die Tour-Kennungen statt einer eingebetteten
  // Verknuepfung - so haengt die Seite nicht daran, wie PostgREST die
  // Beziehung benennt.
  const stoppAntwort = touren.length
    ? await supabase
        .from("tour_stopp")
        .select("standort_id, tour_id, status")
        .in("tour_id", touren.map((t) => t.tour_id))
    : { data: [] };
  const faellig = (planungAntwort.data ?? []) as Tourzeile[];
  const routen = (routenAntwort.data ?? []) as Route[];
  const fahrer = (fahrerAntwort.data ?? []) as Benutzerprofil[];

  const verplant = new Map<string, { tour_id: string; status: string }>();
  ((stoppAntwort.data ?? []) as { standort_id: string; tour_id: string; status: string }[]).forEach(
    (s) => verplant.set(s.standort_id, { tour_id: s.tour_id, status: s.status }),
  );

  const reserve = zahlAusEinstellung(werte, "standort_reserve_prozent", 20);
  const maxTageVoll = zahlAusEinstellung(werte, "max_tage_ueber_schwelle", 7);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  // Regeltouren, die an diesem Tag turnusmäßig fahren – daraus lässt sich mit
  // einem Klick eine Tagestour machen.
  const heuteFaellig = routen
    .map((r) => ({ route: r, termin: naechsterTermin(r.anker_datum, r.intervall_wochen) }))
    .filter(({ termin }) => termin.toISOString().slice(0, 10) === datum)
    .map(({ route }) => ({
      id: route.id,
      name: route.name,
      rhythmus: rhythmusText(route.wochentag, route.intervall_wochen),
      schonGeplant: touren.some((t) => t.route_id === route.id),
    }));

  const pflicht = faellig.filter((z) => z.zustand === "pflicht").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Touren</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Eine Tour ist ein Fahrauftrag: ein Tag, ein Fahrer, eine Folge von Stopps. Mehrere Touren
          am selben Tag sind vorgesehen. Geplant wird in Stopps, nicht in Containern – ein Standort
          wird als Ganzes angefahren und geleert.
        </p>
        <p className="mt-1 text-sm text-ink-3">
          Ein Standort gilt als fällig, wenn weniger als {reserve} % Restkapazität frei sind, eine
          Meldung offen ist, ein Container länger als {maxTageVoll} Tage voll steht – oder keine
          Regeltour rechtzeitig vorbeikommt. <strong>{pflicht} müssen mit.</strong>
        </p>
      </div>

      {planungAntwort.error && (
        <p className="karte-flaeche p-4 text-sm text-ink-2">
          Die Fälligkeitsrechnung konnte nicht geladen werden: {planungAntwort.error.message}
        </p>
      )}

      <Tagesuebersicht
        datum={datum}
        touren={touren}
        faellig={faellig}
        verplant={Object.fromEntries(verplant)}
        regeltourenHeute={heuteFaellig}
        fahrer={fahrer.map((f) => ({ id: f.id, name: f.name || (f.email ?? "ohne Namen"), rolle: f.rolle }))}
        bearbeiten={bearbeiten}
      />

      <p className="text-xs text-ink-3">
        Der Fortschritt kommt aus den Bestätigungen des Fahrpersonals.{" "}
        <Link href="/intern/routen" className="underline underline-offset-2">
          Regeltouren
        </Link>{" "}
        legen fest, welcher Standort turnusmäßig ohnehin angefahren wird – und damit, ob ein voller
        Container warten darf.
      </p>
    </div>
  );
}
