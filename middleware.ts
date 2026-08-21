import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Haelt die Supabase-Sitzung frisch. Der eigentliche Zugriffsschutz sitzt in
 * den Seiten (rolleErzwingen) und in den RLS-Regeln der Datenbank - die
 * Middleware verlaengert nur das Sitzungs-Cookie.
 */
export async function middleware(request: NextRequest) {
  let antwort = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
