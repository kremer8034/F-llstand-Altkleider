import Link from "next/link";
import { notFound } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { rhythmusText } from "@/lib/wochentage";
import { Routenformular } from "@/components/Routenformular";
import type { Route, StandortPlanung } from "@/lib/typen";
import { routeLoeschen, standortEntfernen, standorteZuordnen } from "../aktionen";

export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const L = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

const ZUSTAND_TEXT: Record<string, string> = {
  pflicht: "muss angefahren werden",
  kann: "unter der Reserve",
  ruht: "hat Platz",
};

export default async function Routendetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();
  const benutzer = await angemeldeterBenutzer();

  const { data: roh } = await supabase.from("route").select("*").eq("id", id).maybeSingle();
  if (!roh) notFound();
  const r = roh as Route;

  const [zuordnungAntwort, planungAntwort, alleAntwort] = await Promise.all([
    supabase.from("route_standort").select("standort_id, position").eq("route_id", id),
    supabase.from("standort_planung").select("*"),
    supabase.from("standort").select("id, name, ort").eq("aktiv", true).order("name").limit(1000),
  ]);

  const zugeordnet = new Set(
    ((zuordnungAntwort.data ?? []) as { standort_id: string }[]).map((z) => z.standort_id),
  );
  const planung = new Map<string, StandortPlanung>();
  ((planungAntwort.data ?? []) as StandortPlanung[]).forEach((p) => planung.set(p.standort_id, p));
  const alle = (alleAntwort.data ?? []) as { id: string; name: string; ort: string | null }[];

  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  // Nächster Termin - dieselbe Rechnung wie in der Datenbank.
  const heute = new Date();
  heute.setHours(0, 0, 0, 0);
  const anker = new Date(`${r.anker_datum}T00:00:00`);
  const periode = Math.max(1, r.intervall_wochen) * 7 * 86400_000;
  const schritte = Math.max(0, Math.ceil((heute.getTime() - anker.getTime()) / periode));
  const termine = [0, 1, 2].map((n) => new Date(anker.getTime() + (schritte + n) * periode));

  const meine = alle.filter((s) => zugeordnet.has(s.id));
  const offen = alle.filter((s) => !zugeordnet.has(s.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/intern/routen" className="text-sm text-ink-3 underline underline-offset-2">
            ← Alle Regeltouren
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{r.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {rhythmusText(r.wochentag, r.intervall_wochen)}
            {!r.aktiv && " · pausiert"}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="karte-flaeche p-4">
          <h2 className="font-semibold">Nächste Termine</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {termine.map((t, i) => (
              <li key={t.toISOString()} className={i === 0 ? "font-medium" : "text-ink-2"}>
                <span className="zahl">{DATUM.format(t)}</span>
                {i === 0 && <span className="text-ink-3"> · nächster</span>}
              </li>
            ))}
          </ul>
          {r.bemerkung && <p className="mt-3 border-t pt-3 text-sm text-ink-2">{r.bemerkung}</p>}
        </section>

        {bearbeiten && (
          <section className="lg:col-span-2">
            <Routenformular route={r} />
          </section>
        )}
      </div>

      {/* Standorte dieser Route */}
      <section className="karte-flaeche">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-semibold">Standorte auf dieser Tour</h2>
          <span className="text-sm text-ink-3">{meine.length}</span>
        </div>

        {meine.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">
            Dieser Route ist noch kein Standort zugeordnet.
          </p>
        ) : (
          <div className="divide-y">
            {meine.map((s) => {
              const p = planung.get(s.id);
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <Link href={`/intern/standorte/${s.id}`} className="min-w-[160px] flex-1">
                    <span className="font-medium">{s.name}</span>
                    <span className="block text-xs text-ink-3">{s.ort ?? "ohne Ort"}</span>
                  </Link>

                  <div className="w-full text-xs text-ink-3 sm:w-56 sm:text-right">
                    {p ? (
                      <>
                        <div>
                          {p.freie_liter !== null
                            ? `${L.format(p.freie_liter)} l frei (${p.freie_prozent} %)`
                            : "kein Messwert"}
                        </div>
                        <div>
                          {ZUSTAND_TEXT[p.zustand] ?? p.zustand}
                          {p.gedeckt === false && " · ungedeckt"}
                        </div>
                      </>
                    ) : (
                      <div>kein Zustand bekannt</div>
                    )}
                  </div>

                  {bearbeiten && (
                    <form action={standortEntfernen}>
                      <input type="hidden" name="route_id" value={r.id} />
                      <input type="hidden" name="standort_id" value={s.id} />
                      <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
                        Entfernen
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {bearbeiten && offen.length > 0 && (
        <section className="karte-flaeche p-4">
          <h2 className="font-semibold">Standorte hinzufügen</h2>
          <p className="mt-1 text-sm text-ink-2">
            Mehrfachauswahl mit Strg bzw. Befehlstaste. Ein Standort darf auf mehreren Routen
            liegen – dann zählt der früheste Termin.
          </p>
          <form action={standorteZuordnen} className="mt-3 space-y-2">
            <input type="hidden" name="route_id" value={r.id} />
            <select
              name="standort_id"
              multiple
              size={Math.min(12, Math.max(4, offen.length))}
              className="feld"
              aria-label="Standorte"
            >
              {offen.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.ort ? ` · ${s.ort}` : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="knopf-primaer">
              Hinzufügen
            </button>
          </form>
        </section>
      )}

      {bearbeiten && (
        <form action={routeLoeschen} className="karte-flaeche p-4">
          <input type="hidden" name="id" value={r.id} />
          <h2 className="font-semibold">Route löschen</h2>
          <p className="mt-1 text-sm text-ink-2">
            Die Zuordnungen verschwinden mit. Die Standorte selbst bleiben – sie gelten danach als
            ungedeckt, solange keine andere Route sie abdeckt.
          </p>
          <button type="submit" className="knopf-sekundaer mt-3">
            Route löschen
          </button>
        </form>
      )}
    </div>
  );
}
