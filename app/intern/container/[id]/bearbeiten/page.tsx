import { notFound } from "next/navigation";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { Containerformular } from "@/components/Containerformular";
import type { Container } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Container bearbeiten" };

export default async function ContainerBearbeiten({ params }: { params: Promise<{ id: string }> }) {
  await rolleErzwingen(["admin", "dispo"]);

  const { id } = await params;
  const supabase = await serverClient();
  const { data } = await supabase.from("container").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Container bearbeiten</h1>
      <Containerformular container={data as Container} />
    </div>
  );
}
