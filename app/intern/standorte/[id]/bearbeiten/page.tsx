import Link from "next/link";
import { notFound } from "next/navigation";
import { Standortformular } from "@/components/Standortformular";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import type { Entsorger, Standort } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Standort bearbeiten" };

export default async function StandortBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  await rolleErzwingen(["admin", "dispo"]);
  const { id } = await params;

  const supabase = await serverClient();
  const [standortAntwort, entsorgerAntwort] = await Promise.all([
    supabase.from("standort").select("*").eq("id", id).maybeSingle(),
    supabase.from("entsorger").select("*").eq("aktiv", true).order("gemeinde").order("name"),
  ]);

  const data = standortAntwort.data;
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <Link href={`/intern/standorte/${id}`} className="text-sm text-ink-3 underline underline-offset-2">
          ← Zurück zum Standort
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Standort bearbeiten</h1>
      </div>

      <Standortformular
        standort={data as Standort}
        entsorger={(entsorgerAntwort.data ?? []) as Entsorger[]}
      />
    </div>
  );
}
