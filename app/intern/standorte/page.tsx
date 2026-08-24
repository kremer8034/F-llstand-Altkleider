import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { containerMitZustand, einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { naechsterTermin } from "@/lib/wochentage";
import { Containerliste } from "../container/Containerliste";
import type { Container, ContainerZustand, Route, Standort, StandortZustand } from "@/lib/typen";
import { Standortliste } from "./Standortliste";
import { standorteNachziehen } from "./aktionen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Standorte" };

/**
 * Standorte und Container auf einer Seite.
 *
 * Der Standort ist die Einheit, in der geplant, angefahren und geleert wird –
 * also führt er auch die Oberfläche. Zwei gleichrangige Menüpunkte für
 * dieselbe Sache waren die Ursache der Verwirrung: „Container" zeigte Plätze
 * an, „Standorte" auch, und in welcher der beiden Listen etwas zu ändern war,
 * musste man wissen.
 *
 * Die Containeransicht bleibt – sie beantwortet andere Fragen (welcher Sensor
 * hängt wo, was ist nicht kalibriert, wo ist die Nummer aus dem Anruf). Sie
 * ist jetzt eine Ansicht dieser Seite statt eines eigenen Menüpunkts.
 */
export default async function StandorteSeite({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string }>;
}) {
  const { ansicht } = await searchParams;
  const nachContainer = ansicht === "container";

  const supabase = await serverClient();
  const [
    standortAntwort,
    zustandAntwort,
    containerAntwort,
    ohneAntwort,
    routenAntwort,
    zuordnungAntwort,
    werte,
    benutzer,
    gruppenAntwort,
  ] = await Promise.all([
    supabase.from("standort").select("*").order("name"),
    supabase.from("standort_zustand").select("*"),
    supabase
      .from("container")
      .select("id, nummer, bezeichnung, standort_id, volumen_liter, status")
      .order("nummer"),
    supabase
      .from("container")
      .select("id", { count: "exact", head: true })
      .is("standort_id", null)
      .eq("status", "aktiv"),
    supabase.from("route").select("*").eq("aktiv", true).order("name"),
    supabase.from("route_standort").select("route_id, standort_id"),
    einstellungen(supabase),
    angemeldeterBenutzer(),
    supabase.from("gruppe").select("id, name").eq("aktiv", true).order("name"),
  ]);

  const standorte = (standortAntwort.data ?? []) as Standort[];
  const zustaende = new Map<string, StandortZustand>();
  ((zustandAntwort.data ?? []) as StandortZustand[]).forEach((z) => zustaende.set(z.standort_id, z));

  const alleContainer = (containerAntwort.data ?? []) as (Pick<
    Container,
    "id" | "nummer" | "bezeichnung" | "volumen_liter" | "status"
  > & { standort_id: string | null })[];

  // Füllstände nur für die aufgeklappten Zeilen zu laden wäre eine Abfrage je
  // Klick. Bei einigen hundert Containern ist eine Abfrage für alle billiger.
  const { data: cZustaendeRoh } = await supabase.from("container_zustand").select("*");
  const cZustaende = new Map<string, ContainerZustand>();
  ((cZustaendeRoh ?? []) as ContainerZustand[]).forEach((z) => cZustaende.set(z.container_id, z));

  const containerJeStandort = new Map<string, typeof alleContainer>();
  alleContainer.forEach((c) => {
    if (!c.standort_id) return;
    const liste = containerJeStandort.get(c.standort_id) ?? [];
    liste.push(c);
    containerJeStandort.set(c.standort_id, liste);
  });

  const routen = (routenAntwort.data ?? []) as Route[];
  const routeJeId = new Map(routen.map((r) => [r.id, r]));
  const routenJeStandort = new Map<string, { name: string; termin: number }[]>();
  ((zuordnungAntwort.data ?? []) as { route_id: string; standort_id: string }[]).forEach((z) => {
    const r = routeJeId.get(z.route_id);
    if (!r) return;
    const liste = routenJeStandort.get(z.standort_id) ?? [];
    liste.push({
      name: r.name,
      termin: naechsterTermin(r.anker_datum, r.intervall_wochen).getTime(),
    });
    routenJeStandort.set(z.standort_id, liste);
  });

  const reserve = zahlAusEinstellung(werte, "standort_reserve_prozent", 20);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;
  const ohneStandort = ohneAntwort.count ?? 0;

  const gruppen = (gruppenAntwort.data ?? []) as { id: string; name: string }[];
  const gruppeJeId = new Map(gruppen.map((g) => [g.id, g.name]));

  // Die Containeransicht braucht den vollen Datensatz - nur dann laden.
  const containerZeilen = nachContainer ? await containerMitZustand(supabase) : [];
  const standortName = new Map(standorte.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Standorte</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Ein Standort ist ein Platz, der als Ganzes angefahren und geleert wird. Stehen mehrere
            Container nebeneinander, gehören sie zu einem Standort – dann zählt die freie
            Restkapazität aller zusammen, nicht der einzelne Füllstand.
          </p>
        </div>
        {bearbeiten && (
          <div className="flex gap-2">
            <Link href="/intern/import" className="knopf-sekundaer">
              Import
            </Link>
            <Link
              href={nachContainer ? "/intern/container/neu" : "/intern/standorte/neu"}
              className="knopf-primaer"
            >
              {nachContainer ? "Neuer Container" : "Neuer Standort"}
            </Link>
          </div>
        )}
      </div>

      {/* Umschalter zwischen den beiden Blickwinkeln */}
      <div className="inline-flex rounded-lg border bg-flaeche p-0.5" role="group" aria-label="Ansicht">
        <Link
          href="/intern/standorte"
          aria-current={!nachContainer ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            !nachContainer ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          Nach Standort ({standorte.length})
        </Link>
        <Link
          href="/intern/standorte?ansicht=container"
          aria-current={nachContainer ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            nachContainer ? "bg-flaeche-2 text-ink" : "text-ink-2 hover:text-ink"
          }`}
        >
          Nach Container ({alleContainer.length})
        </Link>
      </div>

      {ohneStandort > 0 && (
        <section className="karte-flaeche border-l-4 p-4" style={{ borderLeftColor: "var(--warnung)" }}>
          <h2 className="font-semibold">{ohneStandort} Container ohne Standort</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Die Tourenplanung geht vom Standort aus. Ein Container ohne Zuordnung hat keinen Stopp,
            an dem er hängt – er taucht in keiner Tour auf, egal wie voll er ist. Das trifft
            Container, die neu angelegt oder ohne Standortspalte importiert wurden.
          </p>
          {bearbeiten ? (
            <form action={standorteNachziehen} className="mt-3">
              <button type="submit" className="knopf-primaer">
                Für jeden einen eigenen Standort anlegen
              </button>
              <p className="mt-2 text-sm text-ink-3">
                Legt je Container einen eigenen Standort an – ohne Gruppierung. Was
                zusammengehört, führen Sie danach von Hand zusammen.
              </p>
            </form>
          ) : (
            <p className="mt-2 text-sm text-ink-3">
              Zum Beheben werden Rechte ab der Disposition gebraucht.
            </p>
          )}
        </section>
      )}

      {nachContainer ? (
        <>
          <p className="text-sm text-ink-3">
            Die Containersicht beantwortet, was die Standortsicht nicht zeigt: welcher Sensor wo
            hängt, was noch nicht kalibriert ist, und wo die Nummer aus dem Anruf steht. Geplant
            und geleert wird trotzdem in Standorten.
          </p>
          <Containerliste
            zeilen={containerZeilen.map((z) => ({
              id: z.id,
              nummer: z.nummer,
              bezeichnung: z.bezeichnung,
              strasse: z.strasse,
              plz: z.plz,
              ort: z.ort,
              status: z.status,
              oeffentlich: z.oeffentlich,
              aufstelldatum: z.aufstelldatum,
              fuellstand_prozent: z.zustand?.fuellstand_prozent ?? null,
              gemessen_am: z.zustand?.gemessen_am ?? null,
              sensor_geraete_id: z.sensor?.geraete_id ?? null,
              kalibriert: z.leer_abstand_mm !== null,
              tage_bis_tour: z.prognose?.tage_bis_tour ?? null,
              prognose_tour_am: z.prognose?.prognose_tour_am ?? null,
              mittel_tage: z.rhythmus?.mittel_tage ?? null,
              leerungen_pro_jahr: z.rhythmus?.leerungen_pro_jahr ?? null,
              standort_id: z.standort_id,
              standort_name: z.standort_id ? (standortName.get(z.standort_id) ?? null) : null,
            }))}
          />
        </>
      ) : (
        <Standortliste
          reserve={reserve}
          gruppen={gruppen}
          zeilen={standorte.map((s) => {
            const z = zustaende.get(s.id);
            const eigene = (containerJeStandort.get(s.id) ?? []).filter(
              (c) => c.status === "aktiv",
            );
            const meineRouten = (routenJeStandort.get(s.id) ?? []).sort(
              (a, b) => a.termin - b.termin,
            );

            return {
              id: s.id,
              name: s.name,
              strasse: s.strasse,
              plz: s.plz,
              ort: s.ort,
              aktiv: s.aktiv,
              container_gesamt: z?.container_gesamt ?? eigene.length,
              container_voll: z?.container_voll ?? 0,
              kapazitaet_liter: z?.kapazitaet_liter ?? null,
              freie_liter: z?.freie_liter ?? null,
              freie_prozent: z?.freie_prozent ?? null,
              zufluss_liter_je_tag: z?.zufluss_liter_je_tag ?? null,
              offene_meldungen: z?.offene_meldungen ?? 0,
              hat_entsorger: s.entsorger_id !== null,
              gruppe_id: s.gruppe_id,
              gruppe_name: s.gruppe_id ? (gruppeJeId.get(s.gruppe_id) ?? null) : null,
              routen: meineRouten.map((r) => r.name),
              container: eigene.map((c) => ({
                id: c.id,
                nummer: c.nummer,
                bezeichnung: c.bezeichnung,
                volumen_liter: c.volumen_liter,
                fuellstand_prozent: cZustaende.get(c.id)?.fuellstand_prozent ?? null,
                gemessen_am: cZustaende.get(c.id)?.gemessen_am ?? null,
              })),
            };
          })}
        />
      )}
    </div>
  );
}
