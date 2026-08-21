"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";

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

    const supabase = browserClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: passwort });

    if (error) {
      // Bewusst unspezifisch: verrät nicht, ob die Adresse existiert.
      setFehler("E-Mail-Adresse oder Passwort stimmt nicht.");
      setLaeuft(false);
      return;
    }

    router.replace(weiter);
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
