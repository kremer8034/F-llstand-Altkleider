import { redirect } from "next/navigation";
import { serverClient } from "./supabase/server";
import type { Benutzerprofil, Benutzerrolle } from "./typen";

/** Angemeldeten Benutzer samt Profil laden - oder null. */
export async function angemeldeterBenutzer(): Promise<{ id: string; email: string | null; profil: Benutzerprofil } | null> {
  const supabase = await serverClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profil } = await supabase
    .from("benutzerprofil")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profil) return null;

  return { id: user.id, email: user.email ?? null, profil: profil as Benutzerprofil };
}

/**
 * Zugriffsschutz fuer Seiten im internen Bereich. Ohne Anmeldung geht es zur
 * Anmeldeseite, bei fehlender Berechtigung auf das Dashboard.
 */
export async function rolleErzwingen(erlaubt?: Benutzerrolle[]) {
  const benutzer = await angemeldeterBenutzer();

  if (!benutzer) redirect("/login");
  if (!benutzer.profil.aktiv) redirect("/login?grund=gesperrt");
  if (erlaubt && !erlaubt.includes(benutzer.profil.rolle)) redirect("/intern?grund=keine-berechtigung");

  return benutzer;
}

export { ROLLEN_TEXT, darfBearbeiten } from "./rollen";
