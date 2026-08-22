import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { rolleErzwingen } from "@/lib/auth";
import { Anlernvorgang } from "./Anlernvorgang";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sensor anlernen" };

export default async function AnlernenSeite({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; container?: string }>;
}) {
  await rolleErzwingen();

  const { code, container: containerAusLink } = await searchParams;

  const supabase = await serverClient();
  const { data } = await supabase
    .from("container")
    .select("id, nummer, bezeichnung, strasse, plz, ort, lat, lng, leer_abstand_mm")
    .in("status", ["aktiv", "inaktiv"])
    .order("nummer");

  const { data: belegt } = await supabase.from("sensor").select("container_id").not("container_id", "is", null);
  const belegteContainer = new Set((belegt ?? []).map((s) => s.container_id as string));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/intern/sensoren" className="text-sm text-ink-3 underline underline-offset-2">
          ← Sensoren
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Sensor anlernen</h1>
        <p className="mt-1 text-sm text-ink-2">
          Sensor und Container werden fest miteinander verbunden. Führen Sie das am besten direkt am
          Standort durch – bei leerem Container, dann stimmt gleich die Kalibrierung.
        </p>
      </div>

      <Anlernvorgang
        container={(data ?? []).map((c) => ({
          ...c,
          hatSensor: belegteContainer.has(c.id),
        }))}
        codeAusLink={code ?? null}
        containerAusLink={containerAusLink ?? null}
      />
    </div>
  );
}
