import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Geräteetikett" };

/**
 * Druckvorlage fuer den Aufkleber am Sensorgehaeuse. Der QR-Code enthaelt einen
 * Link direkt in den Anlernvorgang - Handykamera drauf, fertig.
 */
export default async function Etikett({ params }: { params: { id: string } }) {
  await rolleErzwingen(["admin", "dispo"]);

  const supabase = serverClient();

  const [{ data: sensor }, { data: codes }] = await Promise.all([
    supabase.from("sensor").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("anlerncode")
      .select("code, verbraucht_am, gueltig_bis")
      .eq("sensor_id", params.id)
      .is("verbraucht_am", null)
      .order("angelegt_am", { ascending: false })
      .limit(1),
  ]);

  if (!sensor) notFound();

  const code = codes?.[0]?.code;
  const basis = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const ziel = code ? `${basis}/intern/sensoren/anlernen?code=${code}` : "";
  const qr = code
    ? await QRCode.toDataURL(ziel, { margin: 1, width: 320, errorCorrectionLevel: "M" })
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="print:hidden">
        <Link href="/intern/sensoren" className="text-sm text-ink-3 underline underline-offset-2">
          ← Sensoren
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Geräteetikett</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ausdrucken, laminieren und außen auf das Gehäuse kleben. Der Code wird beim Anlernen
          verbraucht – für einen Gerätewechsel stellen Sie einen neuen aus.
        </p>
      </div>

      <div className="karte-flaeche mx-auto w-full max-w-sm p-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          BRK Miltenberg · Füllstandsensor
        </div>

        <div className="zahl mt-2 text-2xl font-semibold">{sensor.geraete_id}</div>

        {qr ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR-Code für Anlerncode ${code}`} className="mx-auto mt-4 h-48 w-48" />
            <div className="zahl mt-3 text-xl font-semibold tracking-widest">{code}</div>
            <p className="mt-2 text-xs text-ink-3">
              Zum Anlernen scannen oder den Code in der App eingeben.
            </p>
          </>
        ) : (
          <p className="mt-6 text-sm text-ink-2">
            Für dieses Gerät ist kein offener Anlerncode vorhanden. Stellen Sie in der Sensorliste
            einen neuen aus.
          </p>
        )}

        <dl className="mt-5 space-y-1 border-t pt-4 text-left text-xs text-ink-3">
          {sensor.imei && (
            <div className="flex justify-between">
              <dt>IMEI</dt>
              <dd className="zahl">{sensor.imei}</dd>
            </div>
          )}
          {sensor.iccid && (
            <div className="flex justify-between">
              <dt>ICCID</dt>
              <dd className="zahl">{sensor.iccid}</dd>
            </div>
          )}
          {sensor.hardware_rev && (
            <div className="flex justify-between">
              <dt>Hardware</dt>
              <dd>{sensor.hardware_rev}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="text-center print:hidden">
        <p className="text-xs text-ink-3">
          Zum Drucken die Druckfunktion des Browsers verwenden (Strg + P).
        </p>
      </div>
    </div>
  );
}
