import Link from "next/link";
import { notFound } from "next/navigation";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { adresse, alterText, prozentText, stufeVon } from "@/lib/fuellstand";
import { tageText } from "@/lib/prognose";
import type { Container, ContainerZustand, Standort, StandortZustand } from "@/lib/typen";
import { containerLoesen, containerZuordnen, standorteZusammenfuehren } from "../aktionen";

export const dynamic = "force-dynamic";

const L = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export default async function Standortdetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();
  const benutzer = await angemeldeterBenutzer();

  const { data: roh } = await supabase.from("standort").select("*").eq("id", id).maybeSingle();
  if (!roh) notFound();
  const s = roh as Standort;

  const [zustandAntwort, eigeneAntwort, freieAntwort, werteAntwort, andereAntwort] = await Promise.all([
    supabase.from("standort_zustand").select("*").eq("standort_id", id).maybeSingle(),
    supabase.from("container").select("*").eq("standort_id", id).order("nummer"),
    // Kandidaten zum Zuordnen: Container, die allein an ihrem Standort stehen
    supabase
      .from("container")
      .select("id, nummer, bezeichnung, strasse, plz, ort, standort_id")
      .neq("standort_id", id)
      .eq("status", "aktiv")
      .order("nummer")
      .limit(500),
    einstellungen(supabase),
    supabase.from("standort").select("id, name, ort").neq("id", id).order("name").limit(500),
  ]);

  const z = zustandAntwort.data as StandortZustand | null;
  const eigene = (eigeneAntwort.data ?? []) as Container[];
  const kandidaten = (freieAntwort.data ?? []) as Pick<
    Container,
    "id" | "nummer" | "bezeichnung" | "strasse" | "plz" | "ort"
  >[];
  const andere = (andereAntwort.data ?? []) as { id: string; name: string; ort: string | null }[];

  const reserve = zahlAusEinstellung(werteAntwort, "standort_reserve_prozent", 20);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  // Zustände der eigenen Container für die Liste unten
  const { data: zustaendeRoh } = await supabase
    .from("container_zustand")
    .select("*")
    .in("container_id", eigene.length ? eigene.map((c) => c.id) : ["00000000-0000-0000-0000-000000000000"]);
  const zustaende = new Map<string, ContainerZustand>();
  ((zustaendeRoh ?? []) as ContainerZustand[]).forEach((cz) => zustaende.set(cz.container_id, cz));

  const gefuellt = z?.freie_prozent === null || z === null ? null : Math.round(100 - z.freie_prozent);
  const knapp = z?.freie_prozent != null && z.freie_prozent < reserve;
  const tageBisVoll =
    z?.freie_liter != null && z.zufluss_liter_je_tag
      ? (z.freie_liter - (z.kapazitaet_liter ?? 0) * (reserve / 100)) / z.zufluss_liter_je_tag
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/intern/standorte" className="text-sm text-ink-3 underline underline-offset-2">
            ← Alle Standorte
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{s.name}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {adresse(s) || "keine Adresse hinterlegt"}
            {!s.aktiv && " · inaktiv"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {s.lat && s.lng && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="knopf-sekundaer"
            >
              Route
            </a>
          )}
          {bearbeiten && (
            <Link href={`/intern/standorte/${s.id}/bearbeiten`} className="knopf-sekundaer">
              Bearbeiten
            </Link>
          )}
        </div>
      </div>

      {s.zufahrt && (
        <div className="karte-flaeche p-4">
          <h2 className="text-sm font-semibold text-ink-2">Zufahrt</h2>
          <p className="mt-1 text-sm">{s.zufahrt}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Restkapazität */}
        <section className="karte-flaeche p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Freie Restkapazität</h2>
            <span className="text-sm text-ink-3">
              {z?.container_gesamt ?? 0} Container, davon {z?.container_voll ?? 0} voll
            </span>
          </div>

          <div className="mt-3">
            <Fuellstandsbalken prozent={gefuellt} hoehe={12} />
          </div>

          <p className={`mt-2 text-lg font-semibold ${knapp ? "" : "text-ink"}`}>
            {z?.freie_liter == null
              ? "Kein Messwert"
              : `${L.format(z.freie_liter)} Liter frei (${z.freie_prozent} %)`}
          </p>
          {knapp && (
            <p className="text-sm text-ink-2">
              Unter der Reserve von {reserve} % – dieser Standort gehört auf die Tour.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-3">Kapazität</dt>
              <dd className="zahl font-medium">
                {z?.kapazitaet_liter ? `${L.format(z.kapazitaet_liter)} l` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">darin</dt>
              <dd className="zahl font-medium">
                {z?.gefuellt_liter != null ? `${L.format(z.gefuellt_liter)} l` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Zufluss</dt>
              <dd className="zahl font-medium">
                {z?.zufluss_liter_je_tag ? `${L.format(z.zufluss_liter_je_tag)} l/Tag` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Reserve erreicht</dt>
              <dd className="font-medium">{tageBisVoll === null ? "–" : tageText(tageBisVoll)}</dd>
            </div>
          </dl>

          {z?.zufluss_liter_je_tag ? (
            <p className="mt-3 border-t pt-3 text-xs text-ink-3">
              Der gemessene Zufluss ist eine Untergrenze: volle Container nehmen nichts mehr auf, und
              wer keinen Platz findet, nimmt seine Sachen wieder mit. Das sieht kein Sensor.
            </p>
          ) : null}
        </section>

        {/* Zusammenführen */}
        {bearbeiten && andere.length > 0 && (
          <section className="karte-flaeche p-4">
            <h2 className="font-semibold">Zusammenführen</h2>
            <p className="mt-1 text-sm text-ink-2">
              Alle Container eines anderen Standorts hierher übernehmen. Der andere Standort wird
              danach gelöscht.
            </p>
            <form action={standorteZusammenfuehren} className="mt-3 space-y-2">
              <input type="hidden" name="ziel_id" value={s.id} />
              <select name="quelle_id" className="feld" aria-label="Standort, der hierher wandert">
                {andere.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.ort ? ` · ${a.ort}` : ""}
                  </option>
                ))}
              </select>
              <button type="submit" className="knopf-sekundaer w-full">
                Hierher übernehmen
              </button>
            </form>
          </section>
        )}
      </div>

      {/* Container an diesem Standort */}
      <section className="karte-flaeche">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="font-semibold">Container an diesem Standort</h2>
          <span className="text-sm text-ink-3">{eigene.length}</span>
        </div>

        {eigene.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">
            Diesem Standort ist noch kein Container zugeordnet.
          </p>
        ) : (
          <div className="divide-y">
            {eigene.map((c) => {
              const cz = zustaende.get(c.id);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <Stufensymbol stufe={stufeVon(cz?.fuellstand_prozent)} />
                  <Link href={`/intern/container/${c.id}`} className="min-w-[160px] flex-1">
                    <span className="font-medium">{c.bezeichnung ?? c.nummer}</span>
                    <span className="zahl ml-2 text-xs text-ink-3">{c.nummer}</span>
                    <span className="block text-xs text-ink-3">
                      {c.volumen_liter ? `${L.format(c.volumen_liter)} l` : "Volumen nicht gepflegt"}
                      {" · "}
                      {alterText(cz?.gemessen_am)}
                    </span>
                  </Link>
                  <span className="zahl w-16 text-right text-sm">
                    {prozentText(cz?.fuellstand_prozent)}
                  </span>
                  {bearbeiten && eigene.length > 1 && (
                    <form action={containerLoesen}>
                      <input type="hidden" name="container_id" value={c.id} />
                      <input type="hidden" name="standort_id" value={s.id} />
                      <button type="submit" className="knopf-sekundaer px-2 py-1 text-xs">
                        Herauslösen
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Zuordnen */}
      {bearbeiten && (
        <section className="karte-flaeche p-4">
          <h2 className="font-semibold">Container hierher zuordnen</h2>
          <p className="mt-1 text-sm text-ink-2">
            Mehrfachauswahl mit Strg bzw. Befehlstaste. Der Container verlässt damit seinen
            bisherigen Standort.
          </p>
          <form action={containerZuordnen} className="mt-3 space-y-2">
            <input type="hidden" name="standort_id" value={s.id} />
            <select
              name="container_id"
              multiple
              size={Math.min(10, Math.max(4, kandidaten.length))}
              className="feld"
              aria-label="Container"
            >
              {kandidaten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nummer} · {k.bezeichnung ?? "ohne Bezeichnung"}
                  {k.ort ? ` · ${k.ort}` : ""}
                </option>
              ))}
            </select>
            <button type="submit" className="knopf-primaer">
              Zuordnen
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
