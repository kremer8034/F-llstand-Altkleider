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
    // Anschrift und Kalibrierung stehen nicht mehr am Behälter: der Platzname
    // sagt, wo man ist, die Einbauhöhe am Sensor, ob schon kalibriert wurde.
    .select("id, nummer, bezeichnung, standort:standort_id (name, lat, lng)")
    .in("status", ["aktiv", "inaktiv"])
    .order("nummer");

  const { data: belegt } = await supabase
    .from("sensor")
    .select("container_id, einbauhoehe_mm")
    .not("container_id", "is", null);
  const belegteContainer = new Set((belegt ?? []).map((s) => s.container_id as string));
  const kalibrierteContainer = new Set(
    (belegt ?? [])
      .filter((s) => s.einbauhoehe_mm !== null)
      .map((s) => s.container_id as string),
  );

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
        container={(data ?? []).map((c) => {
          const platz = (
            c as { standort?: { name?: string; lat?: number | null; lng?: number | null } | null }
          ).standort;
          return {
            id: c.id as string,
            nummer: c.nummer as string,
            bezeichnung: (c.bezeichnung ?? null) as string | null,
            standort_name: platz?.name ?? null,
            // Die Koordinaten kommen vom Platz - danach sortiert das Anlernen
            // die Liste, damit der nächstgelegene Behälter oben steht.
            lat: platz?.lat ?? null,
            lng: platz?.lng ?? null,
            hatSensor: belegteContainer.has(c.id as string),
            kalibriert: kalibrierteContainer.has(c.id as string),
          };
        })}
        codeAusLink={code ?? null}
        containerAusLink={containerAusLink ?? null}
      />
    </div>
  );
}
