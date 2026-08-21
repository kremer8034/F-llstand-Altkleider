import { createClient } from "@supabase/supabase-js";
import { supabaseAdresseServer } from "./adresse";

/**
 * Client fuer die oeffentlichen Seiten - ohne Cookies und ohne Sitzung.
 *
 * Wichtig fuers Zwischenspeichern: sobald cookies() gelesen wird, rendert
 * Next.js die Seite bei jedem Aufruf neu. Die oeffentliche Karte braucht keine
 * Sitzung, also nimmt sie diesen Client und darf eine Minute lang aus dem
 * Zwischenspeicher kommen.
 */
export function oeffentlicherClient() {
  return createClient(
    supabaseAdresseServer(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
