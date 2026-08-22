import Link from "next/link";
import { notFound } from "next/navigation";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { Verlaufskurve } from "@/components/Verlaufskurve";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { STUFEN, adresse, alterText, formatDatum, formatDatumZeit, stufeVon } from "@/lib/fuellstand";
import type { Alarm, Container, ContainerZustand, Leerung, Messung, Sensor } from "@/lib/typen";
import { Erfassungsbereich } from "./Erfassungsbereich";
import { alarmQuittieren, kalibrieren, meldungErledigen } from "../aktionen";

export const dynamic = "force-dynamic";

const MELDUNG_TEXT: Record<string, string> = {
  voll: "Container ist voll",
  beschaedigt: "Beschädigt",
  vermuellt: "Vermüllt / Fremdmüll",
  zugeparkt: "Zugeparkt / nicht erreichbar",
  sonstiges: "Sonstiges",
};

export default async function Containerdetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await serverClient();
  const benutzer = await angemeldeterBenutzer();

  const { data: container } = await supabase
    .from("container")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!container) notFound();
  const c = container as Container;

  const vor30Tagen = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [zustandAntwort, sensorAntwort, messungAntwort, leerungAntwort, meldungAntwort, alarmAntwort, werte] =
    await Promise.all([
      supabase.from("container_zustand").select("*").eq("container_id", c.id).maybeSingle(),
      supabase.from("sensor").select("*").eq("container_id", c.id).maybeSingle(),
      supabase
        .from("messung")
        .select("id, gemessen_am, fuellstand_prozent, abstand_mm, batterie_v, anlass, gueltig")
        .eq("container_id", c.id)
        .gte("gemessen_am", vor30Tagen)
        .order("gemessen_am", { ascending: true })
        .limit(500),
      supabase
        .from("leerung")
        .select("*")
        .eq("container_id", c.id)
        .order("geleert_am", { ascending: false })
        .limit(20),
      supabase
        .from("meldung")
        .select("*")
        .eq("container_id", c.id)
        .order("gemeldet_am", { ascending: false })
        .limit(20),
      supabase
        .from("alarm")
        .select("*")
        .eq("container_id", c.id)
        .is("geschlossen_am", null)
        .order("ausgeloest_am", { ascending: false }),
      einstellungen(supabase),
    ]);

  const zustand = zustandAntwort.data as ContainerZustand | null;
  const sensor = sensorAntwort.data as Sensor | null;
  const messungen = (messungAntwort.data ?? []) as Messung[];
  const leerungen = (leerungAntwort.data ?? []) as Leerung[];
  const meldungen = (meldungAntwort.data ?? []) as { id: string; typ: string; text: string | null; gemeldet_am: string; erledigt_am: string | null }[];
  const alarme = (alarmAntwort.data ?? []) as Alarm[];

  const schwelleVoll = zahlAusEinstellung(werte, "schwelle_voll", 90);
  const stufe = stufeVon(zustand?.fuellstand_prozent);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  return (
    <div className="space-y-6">
      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/intern/container" className="text-sm text-ink-3 underline underline-offset-2">
            ← Alle Container
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{c.bezeichnung ?? c.nummer}</h1>
          <p className="mt-1 text-sm text-ink-2">
            <span className="zahl">{c.nummer}</span>
            {adresse(c) && ` · ${adresse(c)}`}
            {c.aufstelldatum && ` · Standort seit ${formatDatum(c.aufstelldatum)}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {c.lat && c.lng && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="knopf-sekundaer"
            >
              Route
            </a>
          )}
          {bearbeiten && (
            <Link href={`/intern/container/${c.id}/bearbeiten`} className="knopf-sekundaer">
              Bearbeiten
            </Link>
          )}
        </div>
      </div>

      {/* Offene Alarme */}
      {alarme.length > 0 && (
        <div className="karte-flaeche divide-y">
          {alarme.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Stufensymbol stufe={a.typ === "fuellstand" ? "voll" : "hoch"} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.text ?? a.typ}</div>
                <div className="text-xs text-ink-3">
                  seit {formatDatumZeit(a.ausgeloest_am)}
                  {a.quittiert_am && ` · quittiert ${formatDatumZeit(a.quittiert_am)}`}
                </div>
              </div>
              {!a.quittiert_am && (
                <form action={alarmQuittieren}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="container_id" value={c.id} />
                  <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                    Quittieren
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Aktueller Stand + Verlauf */}
        <section className="karte-flaeche p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Stufensymbol stufe={stufe} groesse={20} />
              <span className="text-lg font-semibold">{STUFEN[stufe].text}</span>
            </div>
            <span className="text-sm text-ink-3">Messung {alterText(zustand?.gemessen_am)}</span>
          </div>

          <div className="mt-3">
            <Fuellstandsbalken prozent={zustand?.fuellstand_prozent ?? null} hoehe={12} />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-3">Abstand</dt>
              <dd className="zahl font-medium">{zustand?.abstand_mm ? `${zustand.abstand_mm} mm` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Batterie</dt>
              <dd className="zahl font-medium">{zustand?.batterie_v ? `${zustand.batterie_v} V` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Funkpegel</dt>
              <dd className="zahl font-medium">{zustand?.rssi ? `${zustand.rssi} dBm` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Volumen</dt>
              <dd className="zahl font-medium">{c.volumen_liter ? `${c.volumen_liter} l` : "–"}</dd>
            </div>
          </dl>

          <div className="mt-6">
            <Verlaufskurve
              punkte={messungen.map((m) => ({ zeit: m.gemessen_am, prozent: m.fuellstand_prozent }))}
              leerungen={leerungen.map((l) => l.geleert_am)}
              schwelleVoll={schwelleVoll}
              ueberschrift="Füllstandsverlauf, letzte 30 Tage"
            />
            <p className="mt-2 text-xs text-ink-3">
              Grüne Punkte auf der Grundlinie markieren erkannte Leerungen.
            </p>
          </div>
        </section>

        {/* Sensor und Kalibrierung */}
        <section className="space-y-4">
          <div className="karte-flaeche p-4">
            <h2 className="mb-3 font-semibold">Sensor</h2>

            {sensor ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Geräte-ID</dt>
                  <dd className="zahl font-medium">{sensor.geraete_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Status</dt>
                  <dd className="font-medium">{sensor.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Letzte Meldung</dt>
                  <dd>{alterText(sensor.letzte_meldung_am)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Sendeintervall</dt>
                  <dd className="zahl">{sensor.intervall_minuten} Min.</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Firmware</dt>
                  <dd className="zahl">{sensor.firmware ?? "–"}</dd>
                </div>
                <div className="pt-2">
                  <Link href={`/intern/sensoren`} className="text-sm underline underline-offset-2">
                    Sensorverwaltung
                  </Link>
                </div>
              </dl>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-ink-2">Diesem Container ist noch kein Sensor zugeordnet.</p>
                <Link href={`/intern/sensoren/anlernen?container=${c.id}`} className="knopf-primaer">
                  Sensor anlernen
                </Link>
              </div>
            )}
          </div>

          <div className="karte-flaeche p-4">
            <h2 className="mb-1 font-semibold">Kalibrierung</h2>
            <p className="mb-3 text-xs text-ink-3">
              Leerwert = gemessener Abstand bei leerem Container. Vollwert = Abstand, ab dem 100 % gilt.
            </p>

            <form action={kalibrieren} className="space-y-3">
              <input type="hidden" name="container_id" value={c.id} />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="leer" className="mb-1 block text-xs text-ink-3">
                    Leer (mm)
                  </label>
                  <input
                    id="leer"
                    name="leer_abstand_mm"
                    type="number"
                    inputMode="numeric"
                    defaultValue={c.leer_abstand_mm ?? ""}
                    placeholder="z. B. 1450"
                    className="feld zahl"
                  />
                </div>
                <div>
                  <label htmlFor="voll" className="mb-1 block text-xs text-ink-3">
                    Voll (mm)
                  </label>
                  <input
                    id="voll"
                    name="voll_abstand_mm"
                    type="number"
                    inputMode="numeric"
                    defaultValue={c.voll_abstand_mm ?? ""}
                    placeholder="z. B. 220"
                    className="feld zahl"
                  />
                </div>
              </div>

              <button type="submit" className="knopf-primaer w-full">
                Kalibrierung speichern
              </button>
              <p className="text-xs text-ink-3">
                Beide Felder leer lassen und speichern: der Leerwert wird aus den Messungen der letzten
                Stunde übernommen (Container muss leer sein, Taster am Sensor drücken).
              </p>
            </form>
          </div>
        </section>
      </div>

      {/* Erfassung vor Ort */}
      <Erfassungsbereich
        containerId={c.id}
        aktuellerFuellstand={zustand?.fuellstand_prozent ?? null}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leerungen */}
        <section className="karte-flaeche">
          <h2 className="border-b px-4 py-3 font-semibold">Leerungen</h2>
          {leerungen.length === 0 ? (
            <p className="p-6 text-sm text-ink-3">Noch keine Leerung erfasst.</p>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Vorher</th>
                  <th>Art</th>
                  <th className="text-right">Menge</th>
                </tr>
              </thead>
              <tbody>
                {leerungen.map((l) => (
                  <tr key={l.id}>
                    <td className="text-ink-2">{formatDatumZeit(l.geleert_am)}</td>
                    <td className="zahl">{l.fuellstand_vorher !== null ? `${l.fuellstand_vorher} %` : "–"}</td>
                    <td className="text-ink-2">{l.art === "automatisch" ? "erkannt" : "erfasst"}</td>
                    <td className="zahl text-right">{l.menge_kg !== null ? `${l.menge_kg} kg` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Meldungen */}
        <section className="karte-flaeche">
          <h2 className="border-b px-4 py-3 font-semibold">Meldungen</h2>
          {meldungen.length === 0 ? (
            <p className="p-6 text-sm text-ink-3">Keine Meldungen vorhanden.</p>
          ) : (
            <ul className="divide-y">
              {meldungen.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {MELDUNG_TEXT[m.typ] ?? m.typ}
                      {m.erledigt_am && <span className="ml-2 text-xs font-normal text-ink-3">erledigt</span>}
                    </div>
                    {m.text && <p className="text-sm text-ink-2">{m.text}</p>}
                    <div className="text-xs text-ink-3">{formatDatumZeit(m.gemeldet_am)}</div>
                  </div>
                  {!m.erledigt_am && (
                    <form action={meldungErledigen}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="container_id" value={c.id} />
                      <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                        Erledigt
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
