import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase-Client fuer Server Components, Server Actions und Route Handler.
 * Nutzt den Anon-Key, damit die RLS-Regeln greifen.
 */
export function serverClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
