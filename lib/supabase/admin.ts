import { createClient } from "@supabase/supabase-js";

/**
 * Client mit Service-Role. Umgeht RLS vollstaendig.
 *
 * NUR in Route Handlern und Server Actions verwenden, niemals in Code, der
 * im Browser landet. Der Schluessel steht ausschliesslich in
 * SUPABASE_SERVICE_ROLE_KEY (ohne NEXT_PUBLIC_-Praefix).
 */
export function adminClient() {
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!schluessel) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ist nicht gesetzt.");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, schluessel, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
