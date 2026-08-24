import Link from "next/link";
import { Routenformular } from "@/components/Routenformular";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import type { Gruppe } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Neue Regeltour" };

export default async function NeueRoute() {
  await rolleErzwingen(["admin", "dispo"]);

  const supabase = await serverClient();
  const { data: gruppen } = await supabase
    .from("gruppe")
    .select("id, name")
    .eq("aktiv", true)
    .order("name");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href="/intern/routen" className="text-sm text-ink-3 underline underline-offset-2">
          ← Alle Regeltouren
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Neue Regeltour</h1>
        <p className="mt-1 text-sm text-ink-2">
          Eine Tour, die in festem Rhythmus gefahren wird. Standorte ordnen Sie danach zu.
        </p>
      </div>

      <Routenformular gruppen={(gruppen ?? []) as Pick<Gruppe, "id" | "name">[]} />
    </div>
  );
}
