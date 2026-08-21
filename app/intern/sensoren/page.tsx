import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { alterText, istVeraltet } from "@/lib/fuellstand";
import { Stufensymbol } from "@/components/Stufensymbol";
import { anlerncodeNeu, sensorEntkoppeln } from "./aktionen";
import type { Sensor } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sensoren" };

const STATUS_TEXT: Record<string, string> = {
  neu: "angelegt, noch nicht angelernt",
  angelernt: "im Einsatz",
  wartung: "in Wartung",
  defekt: "defekt",
  ausser_betrieb: "außer Betrieb",
};

export default async function SensorenSeite() {
  const supabase = serverClient();
  const benutzer = await angemeldeterBenutzer();
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  const [sensorAntwort, containerAntwort, codeAntwort, werte] = await Promise.all([
    supabase.from("sensor").select("*").order("geraete_id"),
    supabase.from("container").select("id, nummer, bezeichnung, ort"),
    supabase.from("anlerncode").select("sensor_id, code, verbraucht_am").order("angelegt_am", { ascending: false }),
    einstellungen(supabase),
  ]);

  const sensoren = (sensorAntwort.data ?? []) as Sensor[];
  const container = new Map(
    (containerAntwort.data ?? []).map((c) => [c.id, c as { id: string; nummer: string; bezeichnung: string | null; ort: string | null }]),
  );

  const offenerCode = new Map<string, string>();
  (codeAntwort.data ?? []).forEach((c) => {
    if (!c.verbraucht_am && !offenerCode.has(c.sensor_id)) offenerCode.set(c.sensor_id, c.code);
  });

  const stilleStunden = zahlAusEinstellung(werte, "max_stille_stunden", 30);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sensoren</h1>
          <p className="mt-1 text-sm text-ink-2">
            {sensoren.length} Geräte · {sensoren.filter((s) => s.status === "angelernt").length} im Einsatz
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/intern/sensoren/anlernen" className="knopf-primaer">
            Sensor anlernen
          </Link>
          {bearbeiten && (
            <Link href="/intern/sensoren/neu" className="knopf-sekundaer">
              Gerät aufnehmen
            </Link>
          )}
        </div>
      </div>

      {sensoren.length === 0 ? (
        <div className="karte-flaeche p-8 text-center">
          <p className="font-medium">Noch kein Gerät aufgenommen.</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-2">
            Nehmen Sie zuerst die Box mit Controller, Ultraschallsensor und SIM-Karte auf. Dabei
            entstehen Geräteschlüssel und Anlerncode für den Aufkleber.
          </p>
        </div>
      ) : (
        <div className="karte-flaeche divide-y overflow-hidden">
          {sensoren.map((s) => {
            const zugeordnet = s.container_id ? container.get(s.container_id) : null;
            const still = s.status === "angelernt" && istVeraltet(s.letzte_meldung_am, stilleStunden);
            const code = offenerCode.get(s.id);

            return (
              <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {still && <Stufensymbol stufe="unbekannt" />}
                    <span className="zahl font-medium">{s.geraete_id}</span>
                    <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                      {STATUS_TEXT[s.status] ?? s.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-ink-2">
                    {zugeordnet ? (
                      <Link href={`/intern/container/${zugeordnet.id}`} className="underline underline-offset-2">
                        {zugeordnet.bezeichnung ?? zugeordnet.nummer}
                        {zugeordnet.ort ? `, ${zugeordnet.ort}` : ""}
                      </Link>
                    ) : (
                      <span className="text-ink-3">keinem Container zugeordnet</span>
                    )}
                  </div>
                </div>

                <div className="w-full text-xs text-ink-3 sm:w-48">
                  <div>
                    Meldung: {alterText(s.letzte_meldung_am)}
                    {still && " · überfällig"}
                  </div>
                  <div className="zahl">
                    {s.batterie_v ? `${s.batterie_v} V` : "– V"} · {s.rssi ? `${s.rssi} dBm` : "– dBm"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {code && (
                    <Link href={`/intern/sensoren/${s.id}/etikett`} className="knopf-sekundaer px-3 py-1.5">
                      Etikett · <span className="zahl">{code}</span>
                    </Link>
                  )}

                  {bearbeiten && !code && (
                    <form action={anlerncodeNeu}>
                      <input type="hidden" name="sensor_id" value={s.id} />
                      <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                        Neuer Anlerncode
                      </button>
                    </form>
                  )}

                  {bearbeiten && s.container_id && (
                    <form action={sensorEntkoppeln}>
                      <input type="hidden" name="sensor_id" value={s.id} />
                      <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                        Entkoppeln
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
