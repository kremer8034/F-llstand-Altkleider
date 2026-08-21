import Link from "next/link";
import { serverClient } from "@/lib/supabase/server";
import { containerMitZustand } from "@/lib/daten";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { Containerliste } from "./Containerliste";

export const dynamic = "force-dynamic";
export const metadata = { title: "Container" };

export default async function ContainerSeite() {
  const supabase = serverClient();
  const [zeilen, benutzer] = await Promise.all([containerMitZustand(supabase), angemeldeterBenutzer()]);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Container</h1>
          <p className="mt-1 text-sm text-ink-2">{zeilen.length} Standorte im Bestand</p>
        </div>
        {bearbeiten && (
          <div className="flex gap-2">
            <Link href="/intern/import" className="knopf-sekundaer">
              Import
            </Link>
            <Link href="/intern/container/neu" className="knopf-primaer">
              Neuer Container
            </Link>
          </div>
        )}
      </div>

      <Containerliste
        zeilen={zeilen.map((z) => ({
          id: z.id,
          nummer: z.nummer,
          bezeichnung: z.bezeichnung,
          strasse: z.strasse,
          plz: z.plz,
          ort: z.ort,
          status: z.status,
          oeffentlich: z.oeffentlich,
          aufstelldatum: z.aufstelldatum,
          fuellstand_prozent: z.zustand?.fuellstand_prozent ?? null,
          gemessen_am: z.zustand?.gemessen_am ?? null,
          sensor_geraete_id: z.sensor?.geraete_id ?? null,
          kalibriert: z.leer_abstand_mm !== null,
        }))}
      />
    </div>
  );
}
