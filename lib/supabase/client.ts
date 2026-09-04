"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SITZUNGS_COOKIE } from "./adresse";

export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Fester Cookie-Name - sonst heisst das Cookie hier anders als beim
    // Server, siehe SITZUNGS_COOKIE.
    { cookieOptions: { name: SITZUNGS_COOKIE } },
  );
}
