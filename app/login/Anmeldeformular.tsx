"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";
import { sicheresZiel } from "@/lib/weiterleitung";

export function Anmeldeformular({ weiter }: { weiter: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(ereignis: React.FormEvent) {
    ereignis.preventDefault();
    setFehler(null);
    setLaeuft(true);

    // Ohne hinterlegte Zugangsdaten kaeme sonst dieselbe Meldung wie bei einem
    // falschen Passwort - und man sucht den Fehler an der falschen Stelle.
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      setFehler(
        "Diese Instanz ist nicht mit einer Datenbank verbunden. Es fehlen die Umgebungsvariablen " +
          "NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      setLaeuft(false);
      return;
    }

    const supabase = browserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: passwort,
    });

    if (error) {
      // Fuer die Fehlersuche in der Browserkonsole - im Text steht bewusst
      // weniger.
      console.error("Anmeldung fehlgeschlagen:", error.status, error.code, error.message);

      if (error.status === 429 || error.code === "over_request_rate_limit") {
        setFehler("Zu viele Anmeldeversuche. Bitte einige Minuten warten und es dann erneut versuchen.");
      } else if (error.code === "email_not_confirmed") {
        setFehler("Diese E-Mail-Adresse ist noch nicht bestätigt.");
      } else if (error.status === 400 || error.code === "invalid_credentials") {
        // Nur hier bewusst unspezifisch: verraet nicht, ob die Adresse existiert.
        setFehler("E-Mail-Adresse oder Passwort stimmt nicht.");
      } else {
        setFehler(
          "Die Anmeldung ist gerade nicht möglich – der Anmeldedienst antwortet nicht wie erwartet. " +
            "Einzelheiten stehen in der Browserkonsole.",
        );
      }

      setLaeuft(false);
      return;
    }

    // Die Seite prueft das Ziel bereits; hier noch einmal, damit auch ein von
    // Hand veraendertes Feld nicht auf eine fremde Adresse fuehrt.
    router.replace(sicheresZiel(weiter));
    router.refresh();
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          E-Mail-Adresse
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="feld"
        />
      </div>

      <div>
        <label htmlFor="passwort" className="mb-1 block text-sm font-medium">
          Passwort
        </label>
        <input
          id="passwort"
          type="password"
          autoComplete="current-password"
          required
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          className="feld"
        />
      </div>

      {fehler && (
        <p role="alert" className="text-sm" style={{ color: "var(--kritisch)" }}>
          {fehler}
        </p>
      )}

      <button type="submit" disabled={laeuft} className="knopf-primaer w-full">
        {laeuft ? "Wird geprüft …" : "Anmelden"}
      </button>

      <p className="text-center text-sm">
        <Link href="/passwort-vergessen" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Passwort vergessen?
        </Link>
      </p>
    </form>
  );
}
