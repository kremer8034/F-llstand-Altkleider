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

  const supabase = await serverClient();

  let standort: Standort | undefined;
  if (standortId) {
    const { data } = await supabase
      .from("standort")
      .select("*")
      .eq("id", standortId)
      .maybeSingle();
    standort = (data as Standort | null) ?? undefined;
  }

  // Ohne vorgegebenen Platz braucht das Formular eine Auswahl - standort_id ist
  // Pflicht, und ein leeres Feld endete bisher in einem Datenbankfehler.
  const standorte = standort
    ? []
    : (((
        await supabase
          .from("standort")
          .select("id, name, ort")
          .eq("aktiv", true)
          .order("name")
      ).data ?? []) as Pick<Standort, "id" | "name" | "ort">[]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">
        {standort ? `Neuer Container an „${standort.name}"` : "Neuer Container"}
      </h1>
      {!standort && (
        <p className="text-sm text-ink-2">
          Für den Einzelfall – eine Nummer außer der Reihe, ein Ersatzcontainer. Der Regelweg führt
          über den Standort: dort geben Sie nur die Anzahl an.
        </p>
      )}
      <Containerformular standort={standort} standorte={standorte} />
    </div>
  );
}
