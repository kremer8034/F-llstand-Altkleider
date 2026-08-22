import { NeuesPasswortFormular } from "./Formular";

export const metadata = { title: "Neues Passwort" };

export default async function NeuesPasswortSeite({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Neues Passwort vergeben</h1>
      <p className="mb-6 text-sm text-ink-2">
        Wählen Sie ein Passwort mit mindestens zehn Zeichen. Verwenden Sie es nicht auch anderswo.
      </p>

      {fehler && (
        <p className="mb-4 rounded-lg border px-3 py-2 text-sm text-ink-2">
          Der Link ist abgelaufen oder wurde schon benutzt. Fordern Sie bitte einen neuen an.
        </p>
      )}

      <div className="karte-flaeche p-5">
        <NeuesPasswortFormular />
      </div>
    </main>
  );
}
