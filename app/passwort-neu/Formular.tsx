"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase/client";

export function NeuesPasswortFormular() {
  const router = useRouter();
  const [bereit, setBereit] = useState<boolean | null>(null);
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [fertig, setFertig] = useState(false);

  // Der Link aus der E-Mail hat ueber /auth/callback bereits eine Sitzung
  // erzeugt. Ohne Sitzung waere der Link abgelaufen.
  useEffect(() => {
    const supabase = browserClient();
    supabase.auth.getUser().then(({ data }) => setBereit(Boolean(data.user)));
  }, []);

  async function absenden(ereignis: React.FormEvent) {
    ereignis.preventDefault();
    setFehler(null);

    if (passwort.length < 10) {
      setFehler("Das Passwort muss mindestens zehn Zeichen haben.");
      return;
    }
    if (passwort !== wiederholung) {
      setFehler("Die beiden Eingaben stimmen nicht überein.");
      return;
    }

    setLaeuft(true);
    const supabase = browserClient();
    const { error } = await supabase.auth.updateUser({ password: passwort });
    setLaeuft(false);

    if (error) {
      setFehler("Das hat nicht geklappt. Fordern Sie bitte einen neuen Link an.");
      return;
    }

    setFertig(true);
    setTimeout(() => {
      router.replace("/intern");
      router.refresh();
    }, 1500);
  }

  if (bereit === false) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-ink-2">
          Für diese Seite fehlt eine gültige Sitzung. Der Link ist vermutlich abgelaufen.
        </p>
        <Link href="/passwort-vergessen" className="knopf-primaer">
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  if (fertig) {
    return <p className="text-sm font-medium text-ink">Passwort gespeichert. Sie werden weitergeleitet …</p>;
  }

  return (
    <form onSubmit={absenden} className="space-y-4">
      <div>
        <label htmlFor="pw1" className="mb-1 block text-sm font-medium">
          Neues Passwort
        </label>
        <input
          id="pw1"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          value={passwort}
          onChange={(e) => setPasswort(e.target.value)}
          className="feld"
        />
      </div>

      <div>
        <label htmlFor="pw2" className="mb-1 block text-sm font-medium">
          Passwort wiederholen
        </label>
        <input
          id="pw2"
          type="password"
          autoComplete="new-password"
          required
          value={wiederholung}
          onChange={(e) => setWiederholung(e.target.value)}
          className="feld"
        />
      </div>

      {fehler && (
        <p role="alert" className="text-sm" style={{ color: "var(--kritisch)" }}>
          {fehler}
        </p>
      )}

      <button type="submit" disabled={laeuft || bereit === null} className="knopf-primaer w-full">
        {laeuft ? "Wird gespeichert …" : "Passwort speichern"}
      </button>
    </form>
  );
}
