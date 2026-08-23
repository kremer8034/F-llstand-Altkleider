import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import type { TourFortschritt } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meine Touren" };

const DATUM = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

function heute(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export default async function FahrerSeite() {
  const benutzer = await angemeldeterBenutzer();
  const supabase = await serverClient();
  const tag = heute();

  // Eigene Touren. Die Disposition sieht zusätzlich die des ganzen Tages -
  // wer plant, muss nachsehen können, woran ein Fahrer gerade hängt.
  const eigene = await supabase
    .from("tour_fortschritt")
    .select("*")
    .eq("fahrer_id", benutzer?.id ?? "")
    .gte("datum", tag)
    .order("datum")
    .order("name");

  const plant = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;
  // `.neq("fahrer_id", ...)` allein würde Touren OHNE Fahrer verschlucken:
  // NULL <> 'x' ist in SQL nicht wahr, sondern unbekannt. Gerade die
  // unzugewiesenen Touren muss die Disposition aber sehen.
  const fremde = plant
    ? await supabase
        .from("tour_fortschritt")
        .select("*")
        .eq("datum", tag)
        .or(`fahrer_id.is.null,fahrer_id.neq.${benutzer?.id ?? ""}`)
        .order("name")
    : { data: [] };

  const meine = (eigene.data ?? []) as TourFortschritt[];
  const andere = (fremde.data ?? []) as TourFortschritt[];

  const offen = meine.filter((t) => t.status === "geplant" || t.status === "laeuft");
  const fertig = meine.filter((t) => t.status !== "geplant" && t.status !== "laeuft");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Meine Touren</h1>

      {offen.length === 0 ? (
        <div className="karte-flaeche p-6 text-center">
          <p className="font-medium">Für Sie ist gerade keine Tour eingeplant.</p>
          <p className="mt-1 text-sm text-ink-2">
            Sobald die Disposition Ihnen eine Tour zuweist, steht sie hier.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {offen.map((t) => (
            <li key={t.tour_id}>
              <Link
                href={`/fahrer/${t.tour_id}`}
                className="karte-flaeche block p-4 transition hover:bg-flaeche-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.name ?? "Tour"}</span>
                  {t.status === "laeuft" && (
                    <span
                      className="rounded px-2 py-0.5 text-xs font-medium text-white"
                      style={{ background: "var(--serie)" }}
                    >
                      unterwegs
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-ink-2">
                  {DATUM.format(new Date(`${t.datum}T12:00:00`))} · {t.stopps_gesamt} Stopps
                </div>
                {t.status === "laeuft" && (
                  <div className="mt-1 text-sm text-ink-3">
                    {t.stopps_erledigt} erledigt
                    {t.naechster_standort && ` · als Nächstes: ${t.naechster_standort}`}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {fertig.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Abgeschlossen</h2>
          <ul className="space-y-2">
            {fertig.map((t) => (
              <li key={t.tour_id} className="karte-flaeche px-4 py-3 text-sm opacity-70">
                <span className="font-medium">{t.name ?? "Tour"}</span>
                <span className="ml-2 text-ink-3">
                  {DATUM.format(new Date(`${t.datum}T12:00:00`))} · {t.stopps_erledigt} von{" "}
                  {t.stopps_gesamt} Stopps
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {andere.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-2">Heute sonst unterwegs</h2>
          <ul className="space-y-2">
            {andere.map((t) => (
              <li key={t.tour_id}>
                <Link
                  href={`/fahrer/${t.tour_id}`}
                  className="karte-flaeche block px-4 py-3 text-sm transition hover:bg-flaeche-2"
                >
                  <span className="font-medium">{t.name ?? "Tour"}</span>
                  <span className="ml-2 text-ink-3">
                    {t.fahrername ?? "ohne Fahrer"} · {t.stopps_erledigt} von {t.stopps_gesamt}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plant && (
        <p className="pt-2 text-xs text-ink-3">
          <Link href="/intern/touren" className="underline underline-offset-2">
            Zur Tourenplanung
          </Link>
        </p>
      )}
    </div>
  );
}
