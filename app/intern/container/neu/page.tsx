import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { Containerformular } from "@/components/Containerformular";
import type { Standort } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Neuer Container" };

/**
 * Neuer Container - wahlweise mit einem Standort im Ruecken.
 *
 * `?standort=<id>` kommt von der Standortseite. Von dort aus ist der Platz
 * bekannt, und dann gehoert er nicht noch einmal abgetippt.
 */
export default async function NeuerContainer({
  searchParams,
}: {
  searchParams: Promise<{ standort?: string }>;
}) {
  await rolleErzwingen(["admin", "dispo"]);
  const { standort: standortId } = await searchParams;

  let standort: Standort | undefined;
  if (standortId) {
    const supabase = await serverClient();
    const { data } = await supabase
      .from("standort")
      .select("*")
      .eq("id", standortId)
      .maybeSingle();
    standort = (data as Standort | null) ?? undefined;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">
        {standort ? `Neuer Container an „${standort.name}"` : "Neuer Container"}
      </h1>
      <Containerformular standort={standort} />
    </div>
  );
}
