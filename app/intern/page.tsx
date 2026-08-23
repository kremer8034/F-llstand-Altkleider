import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth";
import { Kachel } from "@/components/Kachel";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { serverClient } from "@/lib/supabase/server";
import { containerMitZustand, einstellungen, offeneAlarme, zahlAusEinstellung } from "@/lib/daten";
import { STUFEN, adresse, alterText, formatDatumZeit, istVeraltet, stufeVon } from "@/lib/fuellstand";
import type { Alarmtyp } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Übersicht" };

const ALARM_TEXT: Record<Alarmtyp, string> = {
  fuellstand: "Container voll",
  kein_signal: "Kein Signal",
  batterie_schwach: "Batterie schwach",
  messfehler: "Messfehler",
};

export default async function Uebersicht({ searchParams }: { searchParams: Promise<{ grund?: string }> }) {
  const { grund } = await searchParams;

  // Fahrpersonal landet nach der Anmeldung hier - und kann mit einer
  // Kennzahlenübersicht der Disposition nichts anfangen. Es braucht seine
  // Tour. Die übrigen Seiten bleiben erreichbar, nur der Einstieg ist ein
  // anderer.
  const angemeldet = await angemeldeterBenutzer();
  if (angemeldet?.profil.rolle === "fahrer") redirect("/fahrer");

  const supabase = await serverClient();
  const [zeilen, alarme, werte] = await Promise.all([
    containerMitZustand(supabase),
    offeneAlarme(supabase),
    einstellungen(supabase),
  ]);

  const schwelleWarnung = zahlAusEinstellung(werte, "schwelle_warnung", 75);
  const schwelleVoll = zahlAusEinstellung(werte, "schwelle_voll", 90);
  const stilleStunden = zahlAusEinstellung(werte, "max_stille_stunden", 30);

  const aktiv = zeilen.filter((z) => z.status === "aktiv");
  const voll = aktiv.filter((z) => (z.zustand?.fuellstand_prozent ?? -1) >= schwelleVoll);
  const baldVoll = aktiv.filter((z) => {
    const p = z.zustand?.fuellstand_prozent ?? -1;
    return p >= schwelleWarnung && p < schwelleVoll;
  });
  const ohneSignal = aktiv.filter((z) => z.sensor && istVeraltet(z.zustand?.gemessen_am, stilleStunden));
  const ohneSensor = aktiv.filter((z) => !z.sensor);

  const dringend = [...aktiv]
    .filter((z) => z.zustand?.fuellstand_prozent !== null && z.zustand?.fuellstand_prozent !== undefined)
    .sort((a, b) => (b.zustand!.fuellstand_prozent ?? 0) - (a.zustand!.fuellstand_prozent ?? 0))
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Übersicht</h1>
          <p className="mt-1 text-sm text-ink-2">
            {aktiv.length} aktive Container · {aktiv.length - ohneSensor.length} mit Sensor
          </p>
        </div>
        <Link href="/intern/touren" className="knopf-primaer">
          Tour planen
        </Link>
      </div>

      {grund === "keine-berechtigung" && (
        <p className="karte-flaeche p-3 text-sm text-ink-2">
          Für diesen Bereich fehlt Ihrem Konto die Berechtigung.
        </p>
      )}

      {/* Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kachel
          bezeichnung="Voll"
          wert={voll.length}
          zusatz={`ab ${schwelleVoll} % Füllstand`}
          symbol={<Stufensymbol stufe="voll" />}
          href="/intern/touren"
        />
        <Kachel
          bezeichnung="Bald voll"
          wert={baldVoll.length}
          zusatz={`${schwelleWarnung}–${schwelleVoll - 1} % Füllstand`}
          symbol={<Stufensymbol stufe="hoch" />}
          href="/intern/touren"
        />
        <Kachel
          bezeichnung="Kein Signal"
          wert={ohneSignal.length}
          zusatz={`länger als ${stilleStunden} Std. still`}
          symbol={<Stufensymbol stufe="unbekannt" />}
          href="/intern/sensoren"
        />
        <Kachel
          bezeichnung="Ohne Sensor"
          wert={ohneSensor.length}
          zusatz="noch nicht angelernt"
          href="/intern/sensoren/anlernen"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Dringlichste Container */}
        <section className="karte-flaeche lg:col-span-2">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Höchste Füllstände</h2>
            <Link href="/intern/standorte" className="text-sm text-ink-3 underline underline-offset-2">
              Alle Container
            </Link>
          </div>

          {dringend.length === 0 ? (
            <p className="p-6 text-sm text-ink-3">Noch keine Messwerte vorhanden.</p>
          ) : (
            <ul className="divide-y">
              {dringend.map((z) => {
                const stufe = stufeVon(z.zustand?.fuellstand_prozent);
                const veraltet = istVeraltet(z.zustand?.gemessen_am, stilleStunden);
                return (
                  <li key={z.id}>
                    <Link
                      href={`/intern/container/${z.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition hover:bg-flaeche-2"
                    >
                      <div className="min-w-[180px] flex-1">
                        <div className="flex items-center gap-2">
                          <Stufensymbol stufe={stufe} />
                          <span className="font-medium">{z.bezeichnung ?? z.nummer}</span>
                          <span className="text-xs text-ink-3">{z.nummer}</span>
                        </div>
                        <div className="mt-0.5 pl-6 text-sm text-ink-2">{adresse(z)}</div>
                      </div>
                      <div className="w-full max-w-[240px]">
                        <Fuellstandsbalken prozent={z.zustand?.fuellstand_prozent ?? null} />
                        <div className="mt-1 text-xs text-ink-3">
                          {STUFEN[stufe].text} · {alterText(z.zustand?.gemessen_am)}
                          {veraltet && " · Wert veraltet"}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Offene Alarme */}
        <section className="karte-flaeche">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Offene Meldungen</h2>
          </div>

          {alarme.length === 0 ? (
            <p className="p-6 text-sm text-ink-3">Alles ruhig – keine offenen Alarme.</p>
          ) : (
            <ul className="divide-y">
              {alarme.slice(0, 12).map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <Stufensymbol
                      stufe={a.typ === "fuellstand" ? "voll" : a.typ === "batterie_schwach" ? "hoch" : "unbekannt"}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{ALARM_TEXT[a.typ]}</div>
                      {a.container && (
                        <Link
                          href={`/intern/container/${a.container.id}`}
                          className="text-sm text-ink-2 underline underline-offset-2"
                        >
                          {a.container.bezeichnung ?? a.container.nummer}
                          {a.container.ort ? `, ${a.container.ort}` : ""}
                        </Link>
                      )}
                      <div className="mt-0.5 text-xs text-ink-3">{formatDatumZeit(a.ausgeloest_am)}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
