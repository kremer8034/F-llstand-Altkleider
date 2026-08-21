import { rolleErzwingen } from "@/lib/auth";
import { Containerformular } from "@/components/Containerformular";

export const metadata = { title: "Neuer Container" };

export default async function NeuerContainer() {
  await rolleErzwingen(["admin", "dispo"]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Neuer Container</h1>
      <Containerformular />
    </div>
  );
}
