import { NextResponse, type NextRequest } from "next/server";
import { serverClient } from "@/lib/supabase/server";
import { sicheresZiel } from "@/lib/weiterleitung";

/**
 * Ziel aller Links aus Supabase-E-Mails (Einladung, Passwort zuruecksetzen,
 * Bestaetigung). Je nach Vorlage kommt ein PKCE-Code oder ein token_hash an -
 * beide Wege werden hier zu einer Sitzung gemacht.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typ = url.searchParams.get("type");
  const weiter = url.searchParams.get("weiter") ?? url.searchParams.get("next") ?? "/intern";

  const supabase = serverClient();
  let fehlgeschlagen = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    fehlgeschlagen = Boolean(error);
  } else if (tokenHash && typ) {
    const { error } = await supabase.auth.verifyOtp({
      type: typ as "recovery" | "invite" | "signup" | "email_change" | "magiclink",
      token_hash: tokenHash,
    });
    fehlgeschlagen = Boolean(error);
  }

  if (fehlgeschlagen) {
    return NextResponse.redirect(new URL("/passwort-neu?fehler=link", url.origin));
  }

  // Nur eigene Pfade zulassen - keine offene Weiterleitung.
  return NextResponse.redirect(new URL(sicheresZiel(weiter), url.origin));
}
