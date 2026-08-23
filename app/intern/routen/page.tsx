import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { rhythmusText } from "@/lib/wochentage";
import type { Route } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regeltouren" };

const DATUM = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

export default async function RoutenSeite() {
  const supabase = await serverClient();
  const [routenAntwort, zuordnungAntwort, benutzer] = await Promise.all([
    supabase.from("route").select("*").order("name"),
    supabase.from("route_standort").select("route_id, standort_id"),
    angemeldeterBenutzer(),
  ]);

  const routen = (routenAntwort.data ?? []) as Route[];
  const anzahl = new Map<string, number>();
  ((zuordnungAntwort.data ?? []) as { route_id: string }[]).forEach((r) =>
    anzahl.set(r.route_id, (anzahl.get(r.route_id) ?? 0) + 1),
  );

  // Nächster Termin: dieselbe Rechnung wie route_naechster_termin() in der
  // Datenbank - Anker plus volle Perioden bis heute, aufgerundet.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  function naechsterTermin(r: Route): Date {
    const anker = new Date(`${r.anker_datum}T00:00:00`);
    const periode = Math.max(1, r.intervall_wochen) * 7 * 86400_000;
    const schritte = Math.max(0, Math.ceil((heute.getTime() - anker.getTime()) / periode));
    return new Date(anker.getTime() + schritte * periode);
  }

  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;
  const sortiert = [...routen].sort(
    (a, b) => naechsterTermin(a).getTime() - naechsterTermin(b).getTime(),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Regeltouren</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            Touren mit festem Rhythmus. Sie bestimmen, ob ein voller Container warten darf: kommt
            die Regeltour, bevor der Standort keine Kapazität mehr hat, ist keine Extrafahrt nötig.
          </p>
        </div>
        {bearbeiten && (
          <Link href="/intern/routen/neu" className="knopf-primaer">
            Neue Regeltour
          </Link>
        )}
      </div>

      {routen.length === 0 ? (
        <div className="karte-flaeche p-8 text-center">
          <p className="font-medium">Noch keine Regeltour hinterlegt.</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-ink-2">
            Ohne Regeltour gilt jeder Standort als ungedeckt – die Tourenplanung nimmt ihn dann
            auf, sobald er unter die Reserve fällt. Das ist sicher, führt aber zu mehr Fahrten als
            nötig.
          </p>
        </div>
      ) : (
        <div className="karte-flaeche divide-y overflow-hidden">
          {sortiert.map((r) => (
            <Link
              key={r.id}
              href={`/intern/routen/${r.id}`}
              className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-flaeche-2 ${
                r.aktiv ? "" : "opacity-60"
              }`}
            >
              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {!r.aktiv && (
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                      pausiert
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-sm text-ink-2">
                  {rhythmusText(r.wochentag, r.intervall_wochen)}
                </div>
              </div>

              <div className="w-full text-sm sm:w-52">
                <span className="text-ink-3">Nächster Termin</span>
                <div className="zahl font-medium">{DATUM.format(naechsterTermin(r))}</div>
              </div>

              <div className="w-full text-sm text-ink-3 sm:w-32 sm:text-right">
                {anzahl.get(r.id) ?? 0} Standorte
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
