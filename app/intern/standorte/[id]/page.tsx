import Link from "next/link";
import { notFound } from "next/navigation";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { Mehrfachauswahl } from "@/components/Mehrfachauswahl";
import { Entsorgerhinweis } from "@/components/Entsorgerhinweis";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { adresse, alterText, prozentText, stufeVon } from "@/lib/fuellstand";
import { tageText } from "@/lib/prognose";
import { naechsterTermin, rhythmusText } from "@/lib/wochentage";
import type {
  Container,
  ContainerZustand,
  Entsorger,
  Route,
  Standort,
  StandortEntsorgung,
  StandortZustand,
} from "@/lib/typen";
import {
  containerAnzahlSetzen,
  containerLoesen,
  containerZuordnen,
  entsorgerZuordnen,
  regeltourenSetzen,
  standorteZusammenfuehren,
} from "../aktionen";

export const dynamic = "force-dynamic";

const DATUM = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

export default async function Standortdetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();
  const benutzer = await angemeldeterBenutzer();

  const { data: roh } = await supabase.from("standort").select("*").eq("id", id).maybeSingle();
  if (!roh) notFound();
  const s = roh as Standort;

  const [
    zustandAntwort,
    eigeneAntwort,
    kandidatenAntwort,
    werteAntwort,
    andereAntwort,
    routenAntwort,
    meineRoutenAntwort,
    entsorgungAntwort,
    entsorgerAntwort,
  ] = await Promise.all([
    supabase.from("standort_zustand").select("*").eq("standort_id", id).maybeSingle(),
    supabase.from("container").select("*").eq("standort_id", id).order("nummer"),
    // Kandidaten zum Zuordnen.
    //
    // `.neq("standort_id", id)` allein reicht NICHT: in SQL ist NULL <> 'x'
    // nicht wahr, sondern unbekannt - Container ganz ohne Standort fielen
    // damit aus der Liste und liessen sich hier nie zuordnen. Gerade die
    // brauchen es aber am dringendsten, weil sie in keiner Tour auftauchen.
    supabase
      .from("container")
      .select("id, nummer, bezeichnung, standort_id")
      .or(`standort_id.is.null,standort_id.neq.${id}`)
      .eq("status", "aktiv")
      .order("nummer")
      .limit(1000),
    einstellungen(supabase),
    supabase.from("standort").select("id, name, ort").neq("id", id).order("name").limit(1000),
    supabase.from("route").select("*").eq("aktiv", true).order("name"),
    supabase.from("route_standort").select("route_id").eq("standort_id", id),
    supabase.from("standort_entsorgung").select("*").eq("standort_id", id).maybeSingle(),
    supabase.from("entsorger").select("*").eq("aktiv", true).order("gemeinde").order("name"),
  ]);

  const z = zustandAntwort.data as StandortZustand | null;
  const eigene = (eigeneAntwort.data ?? []) as Container[];
  const kandidaten = (kandidatenAntwort.data ?? []) as (Pick<
    Container,
    "id" | "nummer" | "bezeichnung"
  > & { standort_id: string | null })[];
  const andere = (andereAntwort.data ?? []) as { id: string; name: string; ort: string | null }[];
  const routen = (routenAntwort.data ?? []) as Route[];
  const meineRouten = new Set(
    ((meineRoutenAntwort.data ?? []) as { route_id: string }[]).map((r) => r.route_id),
  );
  const entsorgung = entsorgungAntwort.data as StandortEntsorgung | null;
  const entsorger = (entsorgerAntwort.data ?? []) as Entsorger[];

  const reserve = zahlAusEinstellung(werteAntwort, "standort_reserve_prozent", 20);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  // Zustände der eigenen Container für die Liste unten
  const { data: zustaendeRoh } = eigene.length
    ? await supabase
        .from("container_zustand")
        .select("*")
        .in("container_id", eigene.map((c) => c.id))
    : { data: [] };

  const zustaende = new Map<string, ContainerZustand>();
  ((zustaendeRoh ?? []) as ContainerZustand[]).forEach((cz) => zustaende.set(cz.container_id, cz));

  const gefuellt = z?.freie_prozent == null ? null : Math.round(100 - z.freie_prozent);
  const knapp = z?.freie_prozent != null && z.freie_prozent < reserve;
  // Dieselbe Rechnung wie frueher, nur ohne Volumen: kuerzt man es heraus,
  // bleibt (freier Anteil - Reserve) / Zufluss in Prozentpunkten (0022).
  const tageBisVoll =
    z?.freie_prozent != null && z.zufluss_prozent_je_tag
      ? (z.freie_prozent - reserve) / z.zufluss_prozent_je_tag
      : null;

  // Die Regeltouren dieses Standorts, nach dem nächsten Termin sortiert.
  const zugeordneteRouten = routen
    .filter((r) => meineRouten.has(r.id))
    .map((r) => ({ route: r, termin: naechsterTermin(r.anker_datum, r.intervall_wochen) }))
    .sort((a, b) => a.termin.getTime() - b.termin.getTime());

  // Vorschlag für den Bauhof: gleicher Ort wie der Standort.
  const vorschlag = entsorger.find(
    (e) =>
      s.ort &&
      e.gemeinde &&
      e.gemeinde.trim().toLowerCase() === s.ort.trim().toLowerCase(),
  );

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

      {/* Ohne Koordinaten faellt der Platz lautlos aus der oeffentlichen Karte:
          beide oeffentlichen Ansichten verlangen lat und lng. Wer den Standort
          anlegt, merkt davon sonst nichts. */}
      {(s.lat === null || s.lng === null) && (
        <div className="karte-flaeche border-l-4 p-4" style={{ borderLeftColor: "var(--warnung)" }}>
          <h2 className="text-sm font-semibold">Nicht auf der öffentlichen Karte</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Für diesen Standort fehlen die Koordinaten. Ohne sie lässt er sich nicht auf einer Karte
            zeigen – er fehlt deshalb auf der öffentlichen Seite, samt aller Container, die hier
            stehen.{" "}
            {bearbeiten ? (
              <Link
                href={`/intern/standorte/${s.id}/bearbeiten`}
                className="underline underline-offset-2"
              >
                Breiten- und Längengrad nachtragen
              </Link>
            ) : (
              "Breiten- und Längengrad kann jemand mit Bearbeitungsrecht nachtragen."
            )}{" "}
            – in Google Maps mit einem Rechtsklick auf die Stelle abzulesen.
          </p>
        </div>
      )}

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

          <p className="mt-2 text-lg font-semibold">
            {z?.freie_prozent == null ? "Kein Messwert" : `${z.freie_prozent} % frei`}
          </p>
          {knapp && (
            <p className="text-sm text-ink-2">
              Unter der Reserve von {reserve} % – dieser Standort gehört auf die Tour.
            </p>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-3">Container</dt>
              <dd className="zahl font-medium">{z?.container_gesamt ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">ohne Messwert</dt>
              <dd className="zahl font-medium">{z?.container_ohne_wert ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Zufluss</dt>
              <dd className="zahl font-medium">
                {z?.zufluss_prozent_je_tag ? `+${z.zufluss_prozent_je_tag} %/Tag` : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Reserve erreicht</dt>
              <dd className="font-medium">{tageBisVoll === null ? "–" : tageText(tageBisVoll)}</dd>
            </div>
          </dl>

          {z?.zufluss_prozent_je_tag ? (
            <p className="mt-3 border-t pt-3 text-xs text-ink-3">
              Der gemessene Zufluss ist eine Untergrenze: volle Container nehmen nichts mehr auf, und
              wer keinen Platz findet, nimmt seine Sachen wieder mit. Das sieht kein Sensor.
            </p>
          ) : null}
        </section>

        {/* Fremdmüll: wen ruft das Fahrpersonal an? */}
        <section className="karte-flaeche p-4">
          <h2 className="font-semibold">Fremdmüll</h2>
          <div className="mt-3">
            <Entsorgerhinweis entsorgung={entsorgung} />
          </div>

          {bearbeiten && (
            <form action={entsorgerZuordnen} className="mt-4 space-y-2 border-t pt-3">
              <input type="hidden" name="standort_id" value={s.id} />
              <label htmlFor="entsorger_id" className="block text-xs font-medium text-ink-2">
                Zuständiger Bauhof
              </label>
              <select
                id="entsorger_id"
                name="entsorger_id"
                defaultValue={s.entsorger_id ?? ""}
                className="feld"
              >
                <option value="">– keiner, Müll wird mitgenommen –</option>
                {entsorger.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.gemeinde ? ` · ${e.gemeinde}` : ""}
                  </option>
                ))}
              </select>
              {!s.entsorger_id && vorschlag && (
                <p className="text-xs text-ink-3">
                  Vorschlag anhand des Orts: <strong>{vorschlag.name}</strong>
                </p>
              )}
              <button type="submit" className="knopf-sekundaer w-full">
                Übernehmen
              </button>
              <p className="text-xs text-ink-3">
                Gepflegt werden die Bauhöfe unter{" "}
                <Link href="/intern/entsorger" className="underline underline-offset-2">
                  Bauhöfe
                </Link>
                .
              </p>
            </form>
          )}
        </section>
      </div>

      {/* Regeltouren */}
      <section className="karte-flaeche p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Regeltouren</h2>
          <span className="text-sm text-ink-3">
            {zugeordneteRouten.length === 0
              ? "keiner zugeordnet"
              : `${zugeordneteRouten.length} zugeordnet`}
          </span>
        </div>

        {zugeordneteRouten.length === 0 ? (
          <p className="mt-2 max-w-3xl text-sm text-ink-2">
            Dieser Standort ist keiner Regeltour zugeordnet und gilt damit als{" "}
            <strong>ungedeckt</strong>: die Planung nimmt ihn auf, sobald er unter die Reserve
            fällt. Das ist sicher, führt aber zu mehr Extrafahrten als nötig.
          </p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {zugeordneteRouten.map(({ route, termin }, i) => (
              <li key={route.id}>
                <Link
                  href={`/intern/routen/${route.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border bg-flaeche px-3 py-1.5 text-sm transition hover:bg-flaeche-2"
                >
                  <span className="font-medium">{route.name}</span>
                  <span className="text-xs text-ink-3">
                    {rhythmusText(route.wochentag, route.intervall_wochen)}
                  </span>
                  <span className={`zahl text-xs ${i === 0 ? "font-medium" : "text-ink-3"}`}>
                    {DATUM.format(termin)}
                    {i === 0 && zugeordneteRouten.length > 1 && " · zuerst"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {bearbeiten && routen.length > 0 && (
          <form action={regeltourenSetzen} className="mt-4 space-y-3 border-t pt-4">
            <input type="hidden" name="standort_id" value={s.id} />
            <p className="text-sm text-ink-2">
              Ein Standort darf auf mehreren Regeltouren liegen – das ist bei stark frequentierten
              Plätzen der Normalfall. Für die Deckung zählt dann der früheste Termin.
            </p>
            <Regeltourenauswahl routen={routen} zugeordnet={meineRouten} />
            <button type="submit" className="knopf-primaer">
              Zuordnung speichern
            </button>
          </form>
        )}
      </section>

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
                    <span className="block text-xs text-ink-3">{alterText(cz?.gemessen_am)}</span>
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

        {bearbeiten && (
          <div className="border-t bg-flaeche-2/40 p-4">
            <h3 className="text-sm font-semibold">Wie viele stehen hier?</h3>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">
              Nur die Zahl – die Nummern entstehen aus dem Kürzel des Platzes:{" "}
              <span className="zahl">{s.kuerzel ?? "?"}-1</span>,{" "}
              <span className="zahl">{s.kuerzel ?? "?"}-2</span> und so weiter.
            </p>
            <p className="mt-1 text-sm text-ink-3">
              Beim Verringern verschwindet nur, was nie etwas getan hat. Container mit Messungen,
              Leerungen, Meldungen oder Sensor werden stillgelegt – ihre Geschichte bleibt
              auswertbar.
            </p>

            <form action={containerAnzahlSetzen} className="mt-3 flex flex-wrap items-end gap-3">
              <input type="hidden" name="standort_id" value={s.id} />
              <div>
                <label htmlFor="anzahl" className="mb-1 block text-xs font-medium text-ink-2">
                  Anzahl
                </label>
                <input
                  id="anzahl"
                  name="anzahl"
                  type="number"
                  min={0}
                  max={50}
                  required
                  defaultValue={eigene.filter((c) => c.status === "aktiv").length}
                  className="feld zahl w-24"
                />
              </div>
              <button type="submit" className="knopf-primaer">
                Übernehmen
              </button>
              <Link
                href={`/intern/container/neu?standort=${s.id}`}
                className="text-sm text-ink-3 underline underline-offset-2"
              >
                Einzelnen Container von Hand anlegen
              </Link>
            </form>
          </div>
        )}
      </section>

      {/* Zuordnen und Zusammenführen */}
      {bearbeiten && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="karte-flaeche p-4">
            <h2 className="font-semibold">Vorhandenen Container hierher holen</h2>
            <p className="mt-1 text-sm text-ink-2">
              Suchen, ankreuzen, zuordnen. Ein Container verlässt damit seinen bisherigen Standort.
            </p>
            <form action={containerZuordnen} className="mt-3 space-y-3">
              <input type="hidden" name="standort_id" value={s.id} />
              <Mehrfachauswahl
                name="container_id"
                beschriftung="Container"
                leerText="Alle aktiven Container stehen bereits hier."
                eintraege={kandidaten.map((k) => ({
                  id: k.id,
                  titel: `${k.nummer}${k.bezeichnung ? ` · ${k.bezeichnung}` : ""}`,
                  unterzeile: null,
                  hinweis: k.standort_id ? null : "ohne Standort",
                  suchtext: k.standort_id ? null : "ohne standort frei",
                }))}
              />
              <button type="submit" className="knopf-primaer">
                Zuordnen
              </button>
            </form>
          </section>

          <section className="karte-flaeche p-4">
            <h2 className="font-semibold">Anderen Standort hierher übernehmen</h2>
            <p className="mt-1 text-sm text-ink-2">
              Alle Container der ausgewählten Standorte wandern hierher, die leeren Standorte
              werden gelöscht. Der häufigste Handgriff beim Zusammenführen des Ausgangszustands, in
              dem jeder Container noch seinen eigenen Standort hat.
            </p>
            <form action={standorteZusammenfuehren} className="mt-3 space-y-3">
              <input type="hidden" name="ziel_id" value={s.id} />
              <Mehrfachauswahl
                name="quelle_id"
                beschriftung="Standorte"
                leerText="Es gibt keinen weiteren Standort."
                eintraege={andere.map((a) => ({
                  id: a.id,
                  titel: a.name,
                  unterzeile: a.ort,
                }))}
              />
              <button type="submit" className="knopf-sekundaer">
                Hierher übernehmen
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

/** Eigene kleine Hülle, damit die Client-Komponente die Vorauswahl bekommt. */
function Regeltourenauswahl({
  routen,
  zugeordnet,
}: {
  routen: Route[];
  zugeordnet: Set<string>;
}) {
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {routen.map((r) => {
          const termin = naechsterTermin(r.anker_datum, r.intervall_wochen);
          return (
            <li key={r.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition hover:bg-flaeche-2">
                <input
                  type="checkbox"
                  name="route_id"
                  value={r.id}
                  defaultChecked={zugeordnet.has(r.id)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{r.name}</span>
                  <span className="block text-xs text-ink-3">
                    {rhythmusText(r.wochentag, r.intervall_wochen)}
                  </span>
                </span>
                <span className="zahl shrink-0 text-xs text-ink-3">{DATUM.format(termin)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
