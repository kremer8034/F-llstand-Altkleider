import Link from "next/link";
import { notFound } from "next/navigation";
import { Nfceinstellungen } from "../../Nfceinstellungen";
import { bauartText, istFertiggeraet } from "@/lib/geraetearten";
import { nfceinstellungen } from "@/lib/sensoreinstellungen";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import type { Sensor } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sensoreinstellungen" };

/**
 * Was in die NFC-App gehoert - auch Wochen nach dem Aufnehmen.
 *
 * Anders als der Geraeteschluessel des Eigenbaus ist hier nichts ein
 * Einmalgeheimnis: das MQTT-Konto ist fuer alle Sensoren dasselbe und steht
 * in der .env. Wer ein Geraet zuruecksetzt oder ein zweites einstellt, braucht
 * die Werte wieder - und soll dafuer nicht auf den Server muessen.
 */
export default async function Sensoreinstellungsseite({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Nur Disposition und Administration: hier steht ein Passwort auf dem
  // Bildschirm, mit dem sich Messwerte einspielen lassen.
  await rolleErzwingen(["admin", "dispo"]);

  const { id } = await params;
  const supabase = await serverClient();

  const { data } = await supabase.from("sensor").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const sensor = data as Sensor;

  const fertig = istFertiggeraet(sensor.bauart);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/intern/sensoren" className="text-sm text-ink-3 underline underline-offset-2">
          ← Sensoren
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">
          <span className="zahl">{sensor.geraete_id}</span>
        </h1>
        <p className="mt-1 text-sm text-ink-2">{bauartText(sensor.bauart)}</p>
      </div>

      {fertig ? (
        <>
          <Nfceinstellungen daten={nfceinstellungen(sensor.geraete_id, sensor.intervall_minuten)} />

          <div className="karte-flaeche p-4">
            <h2 className="text-sm font-semibold">Unter welcher Kennung sich das Gerät meldet</h2>
            <p className="mt-1 text-xs text-ink-2">
              Kommt nichts an, ist das der erste Blick: die Anwendung sucht das Gerät in dieser
              Reihenfolge. Was tatsächlich in den Meldungen steht, zeigt die Antwort des
              Annahmewegs – bei einem unbekannten Gerät nennt sie die gesuchten Kennungen.
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-xs text-ink-3">Seriennummer</dt>
                <dd className="zahl">{sensor.geraete_id}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-xs text-ink-3">IMEI</dt>
                <dd className="zahl">{sensor.imei ?? <span className="text-ink-3">–</span>}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-32 shrink-0 text-xs text-ink-3">ICCID</dt>
                <dd className="zahl">{sensor.iccid ?? <span className="text-ink-3">–</span>}</dd>
              </div>
            </dl>
          </div>
        </>
      ) : (
        <div className="karte-flaeche p-4">
          <p className="text-sm">
            Ein Eigenbau wird über seine Firmware eingestellt, nicht über eine App. Sein
            Geräteschlüssel wurde beim Aufnehmen einmalig angezeigt und ist danach nicht mehr
            abrufbar.
          </p>
        </div>
      )}
    </div>
  );
}
