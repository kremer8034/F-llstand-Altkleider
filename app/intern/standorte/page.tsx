import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import type { Standort, StandortZustand } from "@/lib/typen";
import { Standortliste } from "./Standortliste";
import { standorteNachziehen } from "./aktionen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Standorte" };

export default async function StandorteSeite() {
  const supabase = await serverClient();
  const [standortAntwort, zustandAntwort, ohneAntwort, werte, benutzer] = await Promise.all([
    supabase.from("standort").select("*").order("name"),
    supabase.from("standort_zustand").select("*"),
    // Container ohne Standort tauchen in keiner Planung auf - siehe unten.
    supabase
      .from("container")
      .select("id", { count: "exact", head: true })
      .is("standort_id", null)
      .eq("status", "aktiv"),
    einstellungen(supabase),
    angemeldeterBenutzer(),
  ]);

  const standorte = (standortAntwort.data ?? []) as Standort[];
  const zustaende = new Map<string, StandortZustand>();
  ((zustandAntwort.data ?? []) as StandortZustand[]).forEach((z) => zustaende.set(z.standort_id, z));

  const reserve = zahlAusEinstellung(werte, "standort_reserve_prozent", 20);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;
  const cluster = standorte.filter((s) => (zustaende.get(s.id)?.container_gesamt ?? 0) >= 2).length;
  const ohneStandort = ohneAntwort.count ?? 0;

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
          <p className="mt-1 text-sm text-ink-3">
            {standorte.length} Standorte, davon {cluster} mit mehr als einem Container. Unter{" "}
            {reserve} % freier Kapazität gilt ein Standort als anzufahren.
          </p>
        </div>
        {bearbeiten && (
          <Link href="/intern/standorte/neu" className="knopf-primaer">
            Neuer Standort
          </Link>
        )}
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

      <Standortliste
        reserve={reserve}
        zeilen={standorte.map((s) => {
          const z = zustaende.get(s.id);
          return {
            id: s.id,
            name: s.name,
            strasse: s.strasse,
            plz: s.plz,
            ort: s.ort,
            aktiv: s.aktiv,
            container_gesamt: z?.container_gesamt ?? 0,
            container_voll: z?.container_voll ?? 0,
            kapazitaet_liter: z?.kapazitaet_liter ?? null,
            freie_liter: z?.freie_liter ?? null,
            freie_prozent: z?.freie_prozent ?? null,
            zufluss_liter_je_tag: z?.zufluss_liter_je_tag ?? null,
            offene_meldungen: z?.offene_meldungen ?? 0,
          };
        })}
      />
    </div>
  );
}
