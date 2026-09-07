import Link from "next/link";
import { redirect } from "next/navigation";
import { angemeldeterBenutzer } from "@/lib/auth";
import { sicheresZiel } from "@/lib/weiterleitung";
import { Anmeldeformular } from "./Anmeldeformular";

export const metadata = { title: "Anmelden" };

export default async function Anmeldeseite({
  searchParams,
}: {
  searchParams: Promise<{ grund?: string; weiter?: string }>;
}) {
  const { grund, weiter: weiterRoh } = await searchParams;

  // Das Ziel steht in der Adresszeile und darf deshalb nicht ungeprueft in eine
  // Weiterleitung wandern.
  const weiter = sicheresZiel(weiterRoh);

  if (await angemeldeterBenutzer()) redirect(weiter);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6">
        {/* Die Marke traegt jetzt sichtbar, statt als gesperrte Versalzeile
            ueber der Ueberschrift zu stehen. Das Rot des Kreisverbands ist in
            der ganzen Oberflaeche sonst nirgends Handlungsfarbe - hier darf
            es fuehren. */}
        <p className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 rounded-sm"
            style={{ background: "var(--brk)" }}
          />
          BRK Kreisverband Miltenberg
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Interner Bereich</h1>
        <p className="mt-2 text-sm text-ink-2">
          Anmeldung für Disposition, Fahrpersonal und Administration.
        </p>
      </div>

      {grund === "gesperrt" && (
        <p className="mb-4 rounded-lg border px-3 py-2 text-sm text-ink-2">
          Dieses Konto ist gesperrt. Bitte wenden Sie sich an die Administration.
        </p>
      )}

      <div className="karte-flaeche p-5">
        <Anmeldeformular weiter={weiter} />
      </div>

      <p className="mt-6 text-center text-sm text-ink-3">
        <Link href="/" className="underline underline-offset-2 hover:text-ink-2">
          Zurück zur öffentlichen Karte
        </Link>
      </p>
    </main>
  );
}
