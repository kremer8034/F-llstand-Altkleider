import Link from "next/link";
import { PasswortVergessenFormular } from "./Formular";

export const metadata = { title: "Passwort zurücksetzen" };

export default function PasswortVergessenSeite() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Passwort zurücksetzen</h1>
      <p className="mb-6 text-sm text-ink-2">
        Geben Sie Ihre E-Mail-Adresse ein. Sie erhalten einen Link, mit dem Sie sich ein neues
        Passwort vergeben können. Der Link ist eine Stunde gültig.
      </p>

      <div className="karte-flaeche p-5">
        <PasswortVergessenFormular />
      </div>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Zurück zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
