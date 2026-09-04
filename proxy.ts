import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SITZUNGS_COOKIE, istKonfiguriert, supabaseAdresseServer } from "@/lib/supabase/adresse";

/**
 * Haelt die Supabase-Sitzung frisch. Der eigentliche Zugriffsschutz sitzt in
 * den Seiten (rolleErzwingen) und in den RLS-Regeln der Datenbank - diese
 * Schicht verlaengert nur das Sitzungs-Cookie.
 *
 * Hiess bis Next.js 15 "middleware.ts" mit einer Funktion middleware(); seit
 * Next 16 heisst dieselbe Sache "proxy.ts" mit proxy(). Inhaltlich unveraendert.
 */
export async function proxy(request: NextRequest) {
  let antwort = NextResponse.next({ request: { headers: request.headers } });

  // Ohne Zugangsdaten gibt es keine Sitzung, die aufzufrischen waere.
  //
  // Ohne diese Abfrage wirft createServerClient hier, und zwar bevor die Seite
  // selbst an die Reihe kommt: eine frisch angelegte Instanz ohne gesetzte
  // Umgebungsvariablen antwortete auf JEDER Seite mit "Internal Server Error"
  // statt mit der vorgesehenen Erklaerung, was zu tun ist. Die oeffentliche
  // Karte und die Anmeldeseite fangen den Fall ausdruecklich ab - diese
  // Schicht lief ihnen nur zuvor.
  if (!istKonfiguriert()) return antwort;

  const supabase = createServerClient(
    // Diese Schicht laeuft im Container, also ueber die interne Adresse.
    supabaseAdresseServer(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Muss zum Browser passen, siehe SITZUNGS_COOKIE.
      cookieOptions: { name: SITZUNGS_COOKIE },
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          antwort = NextResponse.next({ request: { headers: request.headers } });
          antwort.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          antwort = NextResponse.next({ request: { headers: request.headers } });
          antwort.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  await supabase.auth.getUser();

  return antwort;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
