import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdresseServer, istKonfiguriert } from "./adresse";

/**
 * Client fuer die oeffentlichen Seiten - ohne Cookies und ohne Sitzung.
 *
 * Wichtig fuers Zwischenspeichern: sobald cookies() gelesen wird, rendert
 * Next.js die Seite bei jedem Aufruf neu. Die oeffentliche Karte braucht keine
 * Sitzung, also nimmt sie diesen Client und darf eine Minute lang aus dem
 * Zwischenspeicher kommen.
 *
 * Fehlt die Konfiguration, kommt null zurueck statt eines Fehlers: eine frisch
 * angelegte, noch nicht eingerichtete Instanz soll eine verstaendliche Seite
 * zeigen und nicht schon beim Bauen abstuerzen.
 */
export function oeffentlicherClient(): SupabaseClient | null {
  if (!istKonfiguriert()) return null;

  return createClient(supabaseAdresseServer(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
