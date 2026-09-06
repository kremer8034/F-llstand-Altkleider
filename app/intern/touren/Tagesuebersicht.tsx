"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Mehrfachauswahl } from "@/components/Mehrfachauswahl";
import { adresse } from "@/lib/fuellstand";
import { tageText } from "@/lib/prognose";
import type { TourFortschritt } from "@/lib/typen";
import { GRUND_TEXT, TOURSTATUS_TEXT, type Tourzeile } from "./planungstypen";
import { stoppsHinzufuegen, tourAnlegen } from "./aktionen";

/** Containerfüllungen: eine Nachkommastelle, "2,4 Füllungen" liest sich rund. */
const F = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

/**
 * Was an einem Platz zu holen ist, in Containerfüllungen.
 *
 * Seit 0022 führen wir kein Volumen je Container mehr - gerechnet wird aus der
 * Belegung mal der Zahl der GEMESSENEN Container. Ungemessene bleiben draußen:
 * sie sind unbekannt, nicht leer.
 */
function fuellungenText(z: Tourzeile): string | null {
  if (z.belegt_prozent === null) return null;
  const gemessen = z.container_gesamt - z.container_ohne_wert;
  if (gemessen <= 0) return null;
  return `${F.format((gemessen * Number(z.belegt_prozent)) / 100)} Füllungen`;
}
const DATUM_LANG = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const UHR = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

function tagVerschieben(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00`);
  d.setDate(d.getDate() + tage);
  return d.toISOString().slice(0, 10);
}

/**
 * Der Arbeitstag der Disposition auf einer Seite.
 *
 * Oben, was heute gefahren wird – mit Fortschritt, sobald jemand unterwegs
 * ist. Darunter, was ansteht und noch auf keiner Tour liegt.
 *
 * Die Trennung ist der Punkt: bisher gab es nur die Fälligkeitsliste, und was
 * die Disposition daraus zusammengestellt hatte, stand im Browser und war beim
 * Neuladen weg. Ein Fahrauftrag ließ sich daraus nicht machen.
 */
export function Tagesuebersicht({
  datum,
  touren,
  gruppen,
  gruppeJeTour,
  gruppeJeStandort,
  faellig,
  verplant,
  regeltourenHeute,
  bearbeiten,
}: {
  datum: string;
  touren: TourFortschritt[];
  gruppen: { id: string; name: string }[];
  /** Bereitschaft je Tour – die Fortschrittsansicht führt die Spalte nicht. */
  gruppeJeTour: Record<string, string | null>;
  gruppeJeStandort: Record<string, string | null>;
  faellig: Tourzeile[];
  verplant: Record<string, { tour_id: string; status: string }>;
  regeltourenHeute: { id: string; name: string; rhythmus: string; schonGeplant: boolean }[];
  bearbeiten: boolean;
}) {
  const router = useRouter();
  const [zielTour, setZielTour] = useState<string>("");
  // "" = alle, "__ohne__" = ohne Bereitschaft, sonst eine Gruppen-Kennung.
  const [gruppe, setGruppe] = useState("");

  const gruppenName = new Map(gruppen.map((g) => [g.id, g.name]));

  /** Gehört das zur gewählten Bereitschaft? Ohne Auswahl gehört alles dazu. */
  function passt(gruppeId: string | null | undefined): boolean {
    if (gruppe === "") return true;
    if (gruppe === "__ohne__") return !gruppeId;
    return gruppeId === gruppe;
  }

  const sichtbareTouren = touren.filter((t) => passt(gruppeJeTour[t.tour_id]));

  const heute = new Date();
  const istHeute = datum === new Date(heute.getTime() - heute.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  // Fällige Standorte, die an diesem Tag noch auf keiner Tour stehen.
  const offen = useMemo(
    () =>
      faellig.filter(
        (z) =>
          !verplant[z.standort_id] &&
          (gruppe === ""
            ? true
            : gruppe === "__ohne__"
              ? !gruppeJeStandort[z.standort_id]
              : gruppeJeStandort[z.standort_id] === gruppe),
      ),
    [faellig, verplant, gruppe, gruppeJeStandort],
  );
  const pflichtOffen = offen.filter((z) => z.zustand === "pflicht");
  const kannOffen = offen.filter((z) => z.zustand === "kann");

  // Nur Touren, die noch Stopps aufnehmen können.
  const aufnahmefaehig = sichtbareTouren.filter(
    (t) => t.status === "geplant" || t.status === "laeuft",
  );

  return (
    <div className="space-y-5">
      {/* Tagwahl */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/intern/touren?tag=${tagVerschieben(datum, -1)}`} className="knopf-sekundaer px-3 py-1.5">
          ←
        </Link>
        <span className="font-medium">
          {DATUM_LANG.format(new Date(`${datum}T12:00:00`))}
          {istHeute && <span className="ml-2 text-sm text-ink-3">heute</span>}
        </span>
        <Link href={`/intern/touren?tag=${tagVerschieben(datum, 1)}`} className="knopf-sekundaer px-3 py-1.5">
          →
        </Link>
        {!istHeute && (
          <Link href="/intern/touren" className="text-sm underline underline-offset-2">
            zu heute
          </Link>
        )}

        {gruppen.length > 0 && (
          <select
            value={gruppe}
            onChange={(e) => setGruppe(e.target.value)}
            className="feld w-auto"
            aria-label="Bereitschaft"
          >
            <option value="">Alle Bereitschaften</option>
            {gruppen.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="__ohne__">Ohne Bereitschaft</option>
          </select>
        )}

        {bearbeiten && (
          <form action={tourAnlegen} className="ml-auto">
            <input type="hidden" name="datum" value={datum} />
            {/* Wird nach Bereitschaft gefiltert, entsteht die neue Tour gleich
                in dieser - sonst legte man sie an und müsste sie danach
                zuordnen, nur um sie in der eigenen Liste wiederzufinden. */}
            {gruppe !== "" && gruppe !== "__ohne__" && (
              <input type="hidden" name="gruppe_id" value={gruppe} />
            )}
            <button type="submit" className="knopf-primaer">
              Neue Tour
              {gruppe !== "" && gruppe !== "__ohne__" && ` für ${gruppenName.get(gruppe) ?? ""}`}
            </button>
          </form>
        )}
      </div>

      {/* Regeltouren, die heute turnusmäßig fahren */}
      {bearbeiten && regeltourenHeute.length > 0 && (
        <section className="karte-flaeche p-4">
          <h2 className="font-semibold">Regeltouren an diesem Tag</h2>
          <p className="mt-1 text-sm text-ink-2">
            Aus einer Regeltour wird mit einem Klick ein Fahrauftrag – die Standorte und ihre
            Reihenfolge kommen mit. Danach lässt sich beides anpassen.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {regeltourenHeute.map((r) => (
              <form key={r.id} action={tourAnlegen}>
                <input type="hidden" name="route_id" value={r.id} />
                <input type="hidden" name="datum" value={datum} />
                <button
                  type="submit"
                  className="knopf-sekundaer"
                  disabled={r.schonGeplant}
                  title={r.schonGeplant ? "Für diese Regeltour gibt es an diesem Tag schon eine Tour." : undefined}
                >
                  {r.name}
                  <span className="text-xs text-ink-3">
                    {r.schonGeplant ? "bereits geplant" : r.rhythmus}
                  </span>
                </button>
              </form>
            ))}
          </div>
        </section>
      )}

      {/* Die Touren des Tages */}
      {sichtbareTouren.length === 0 ? (
        <div className="karte-flaeche p-8 text-center">
          <p className="font-medium">Für diesen Tag ist keine Tour angelegt.</p>
          <p className="mx-auto mt-1 max-w-xl text-sm text-ink-2">
            {pflichtOffen.length > 0
              ? `${pflichtOffen.length} Standorte müssen angefahren werden. Legen Sie eine Tour an und nehmen Sie sie auf.`
              : "Es steht auch nichts an – alle Standorte haben genug Restkapazität, und wo es knapp wird, kommt die Regeltour rechtzeitig."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sichtbareTouren.map((t) => {
            const anteil =
              t.stopps_gesamt > 0
                ? Math.round(((t.stopps_erledigt + t.stopps_uebersprungen) / t.stopps_gesamt) * 100)
                : 0;

            return (
              <Link
                key={t.tour_id}
                href={`/intern/touren/${t.tour_id}`}
                className="karte-flaeche block p-4 transition hover:bg-flaeche-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{t.name ?? "Tour ohne Namen"}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          t.status === "laeuft" ? "text-white" : "bg-flaeche-2 text-ink-2"
                        }`}
                        style={t.status === "laeuft" ? { background: "var(--serie)" } : undefined}
                      >
                        {TOURSTATUS_TEXT[t.status] ?? t.status}
                      </span>
                      {t.routenname && (
                        <span className="rounded border px-1.5 py-0.5 text-xs text-ink-2">
                          {t.routenname}
                        </span>
                      )}
                      {gruppeJeTour[t.tour_id] && (
                        <span className="rounded border px-1.5 py-0.5 text-xs text-ink-2">
                          {gruppenName.get(gruppeJeTour[t.tour_id] as string) ?? "Bereitschaft"}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-2">
                      {t.fahrername ? (
                        t.fahrername
                      ) : (
                        <span style={{ color: "var(--ernst)" }}>kein Fahrer zugewiesen</span>
                      )}
                      {t.begonnen_am && ` · ab ${UHR.format(new Date(t.begonnen_am))} Uhr`}
                      {t.abgeschlossen_am &&
                        ` · fertig ${UHR.format(new Date(t.abgeschlossen_am))} Uhr`}
                    </div>
                  </div>

                  <div className="w-full sm:w-64">
                    <div className="flex items-baseline justify-between text-xs text-ink-3">
                      <span>
                        {t.stopps_erledigt} von {t.stopps_gesamt} Stopps
                        {t.stopps_uebersprungen > 0 && ` · ${t.stopps_uebersprungen} übersprungen`}
                      </span>
                      <span className="zahl">{anteil} %</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-flaeche-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${anteil}%`,
                          background: t.status === "abgeschlossen" ? "var(--gut)" : "var(--serie)",
                        }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-ink-3">
                      {t.status === "laeuft" && t.naechster_standort
                        ? `als Nächstes: ${t.naechster_standort}`
                        : t.container_geleert > 0
                          ? `${t.container_geleert} Container geleert${
                              t.container_stehen_geblieben > 0
                                ? `, ${t.container_stehen_geblieben} stehen geblieben`
                                : ""
                            }`
                          : "noch nichts erfasst"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Was ansteht und noch nirgends draufsteht */}
      <section className="karte-flaeche overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">
            Steht an und ist noch nicht verplant
            <span className="ml-2 text-sm font-normal text-ink-3">
              {pflichtOffen.length} Pflicht
              {kannOffen.length > 0 && `, ${kannOffen.length} könnte man mitnehmen`}
            </span>
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            Pflicht muss mit. Bei „könnte man mitnehmen“ kommt die Regeltour rechtzeitig – ob sich
            der Abstecher lohnt, zeigt der Umweg in der Tour selbst.
          </p>
        </div>

        {offen.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-3">
            {faellig.length === 0
              ? "Nichts fällig. Alle Standorte haben genug Restkapazität."
              : "Alles Fällige steht bereits auf einer Tour dieses Tages."}
          </p>
        ) : (
          <>
            {bearbeiten && aufnahmefaehig.length > 0 && (
              <form action={stoppsHinzufuegen} className="space-y-3 border-b bg-flaeche-2/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="zieltour" className="text-sm font-medium">
                    Auf Tour setzen
                  </label>
                  <select
                    id="zieltour"
                    name="tour_id"
                    value={zielTour}
                    onChange={(e) => setZielTour(e.target.value)}
                    className="feld w-auto"
                    required
                  >
                    <option value="">– Tour wählen –</option>
                    {aufnahmefaehig.map((t) => (
                      <option key={t.tour_id} value={t.tour_id}>
                        {t.name ?? "Tour ohne Namen"}
                        {t.fahrername ? ` · ${t.fahrername}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <Mehrfachauswahl
                  name="standort_id"
                  beschriftung="Standorte"
                  hoeheKlasse="max-h-64"
                  eintraege={offen.map((z) => ({
                    id: z.standort_id,
                    titel: `${z.name}${z.zustand === "pflicht" ? " · Pflicht" : ""}`,
                    unterzeile: `${adresse(z) || "ohne Adresse"} · ${GRUND_TEXT[z.grund]}`,
                    hinweis: fuellungenText(z),
                    suchtext: z.zustand,
                  }))}
                />

                <button type="submit" className="knopf-primaer" disabled={!zielTour}>
                  Ausgewählte aufnehmen
                </button>
              </form>
            )}

            <div className="divide-y">
              {offen.map((z) => (
                <div
                  key={z.standort_id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                >
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/intern/standorte/${z.standort_id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {z.name}
                      </Link>
                      {z.zustand === "pflicht" && (
                        <span
                          className="rounded px-1.5 py-0.5 text-xs font-medium text-white"
                          style={{ background: "var(--ernst)" }}
                        >
                          Pflicht
                        </span>
                      )}
                      <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                        {z.container_gesamt} Container
                      </span>
                      {z.offene_meldungen > 0 && (
                        <span className="rounded border px-1.5 py-0.5 text-xs text-ink-2">
                          {z.offene_meldungen} Meldung{z.offene_meldungen > 1 ? "en" : ""}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-2">{adresse(z)}</div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {GRUND_TEXT[z.grund]}
                      {z.tage_bis_reserve !== null && ` · Reserve ${tageText(z.tage_bis_reserve)}`}
                      {z.routenname && ` · ${z.routenname}`}
                    </div>
                  </div>

                  <div className="w-full max-w-[200px]">
                    <Fuellstandsbalken
                      prozent={z.freie_prozent === null ? null : Math.round(100 - z.freie_prozent)}
                    />
                    <div className="mt-1 text-xs text-ink-3">
                      {fuellungenText(z) && `${fuellungenText(z)} holen`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Was heute schon verplant ist, aber woanders */}
      {Object.keys(verplant).length > 0 && faellig.length > offen.length && (
        <p className="text-sm text-ink-3">
          {faellig.length - offen.length} weitere fällige Standorte stehen bereits auf einer Tour
          dieses Tages.
        </p>
      )}
    </div>
  );
}
