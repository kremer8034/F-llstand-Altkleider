"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";

export function PasswortVergessenFormular() {
  const [email, setEmail] = useState("");
  const [gesendet, setGesendet] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(ereignis: React.FormEvent) {
    ereignis.preventDefault();
    setLaeuft(true);

    const supabase = browserClient();
    const ziel = `${window.location.origin}/auth/callback?weiter=/passwort-neu`;
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: ziel });

    // Immer dieselbe Rueckmeldung - sonst liesse sich abfragen, welche
    // Adressen im System hinterlegt sind.
    setGesendet(true);
    setLaeuft(false);
  }

  if (gesendet) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-ink">E-Mail ist unterwegs.</p>
        <p className="text-ink-2">
          Falls für <strong>{email}</strong> ein Konto besteht, finden Sie dort gleich einen Link zum
          Zurücksetzen. Schauen Sie notfalls im Spam-Ordner nach.
        </p>
        <button type="button" onClick={() => setGesendet(false)} className="knopf-sekundaer">
          Andere Adresse eingeben
        </button>
      </div>
    );
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

      <button type="submit" disabled={laeuft} className="knopf-primaer w-full">
        {laeuft ? "Wird gesendet …" : "Link anfordern"}
      </button>
    </form>
  );
}
