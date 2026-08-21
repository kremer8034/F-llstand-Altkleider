import type { Benutzerrolle } from "./typen";

/**
 * Rollenwissen ohne Serverabhaengigkeit - wird auch von Client-Komponenten
 * benutzt und darf deshalb nichts aus lib/supabase/server importieren.
 */
export const ROLLEN_TEXT: Record<Benutzerrolle, string> = {
  admin: "Administration",
  dispo: "Disposition",
  fahrer: "Fahrpersonal",
};

export function darfBearbeiten(rolle: Benutzerrolle): boolean {
  return rolle === "admin" || rolle === "dispo";
}
