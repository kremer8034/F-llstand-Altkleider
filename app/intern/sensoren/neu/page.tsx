import Link from "next/link";
import { rolleErzwingen } from "@/lib/auth";
import { Geraeteaufnahme } from "./Geraeteaufnahme";

export const metadata = { title: "Gerät aufnehmen" };

export default async function NeuerSensor() {
  await rolleErzwingen(["admin", "dispo"]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link href="/intern/sensoren" className="text-sm text-ink-3 underline underline-offset-2">
          ← Sensoren
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Gerät aufnehmen</h1>
        <p className="mt-1 text-sm text-ink-2">
          Schritt 1 von 2: die Box im System anlegen. Dabei entstehen der Geräteschlüssel für die
          Firmware und der Anlerncode für den Aufkleber. Schritt 2 – das Verheiraten mit einem
          Container – passiert später draußen am Standort.
        </p>
      </div>

      <Geraeteaufnahme />
    </div>
  );
}
