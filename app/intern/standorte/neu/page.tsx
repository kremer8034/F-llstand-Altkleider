import Link from "next/link";
import { Standortformular } from "@/components/Standortformular";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import type { Entsorger, Gruppe } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Neuer Standort" };

export default async function NeuerStandort() {
  await rolleErzwingen(["admin", "dispo"]);

  const supabase = await serverClient();
  const [entsorgerAntwort, gruppenAntwort] = await Promise.all([
    supabase.from("entsorger").select("*").eq("aktiv", true).order("gemeinde").order("name"),
    supabase.from("gruppe").select("id, name").eq("aktiv", true).order("name"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/intern/standorte" className="text-sm text-ink-3 underline underline-offset-2">
          ← Alle Standorte
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Neuer Standort</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ein Platz, an dem ein oder mehrere Container stehen. Die Container ordnen Sie danach zu.
        </p>
      </div>

      <Standortformular
        entsorger={(entsorgerAntwort.data ?? []) as Entsorger[]}
        gruppen={(gruppenAntwort.data ?? []) as Pick<Gruppe, "id" | "name">[]}
      />
    </div>
  );
}
