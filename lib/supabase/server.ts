import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SITZUNGS_COOKIE, supabaseAdresseServer } from "./adresse";

/**
 * Supabase-Client fuer Server Components, Server Actions und Route Handler.
 * Nutzt den Anon-Key, damit die RLS-Regeln greifen.
 *
 * Seit Next.js 15 liefert cookies() ein Promise - die Funktion ist deshalb
 * asynchron und will mit await aufgerufen werden.
 */
export async function serverClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseAdresseServer(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Muss zum Browser passen, siehe SITZUNGS_COOKIE.
      cookieOptions: { name: SITZUNGS_COOKIE },
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // In Server Components ist Schreiben nicht erlaubt - die Middleware
            // erneuert die Sitzung, deshalb ist das hier folgenlos.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // siehe oben
          }
        },
      },
    },
  );
}
