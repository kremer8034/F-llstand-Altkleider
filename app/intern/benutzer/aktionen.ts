"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { angemeldeterBenutzer } from "@/lib/auth";
import type { Benutzerrolle } from "@/lib/typen";

async function adminErzwingen() {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (benutzer.profil.rolle !== "admin") redirect("/intern?grund=keine-berechtigung");
  return benutzer;
}

export interface EinladungErgebnis {
  ok: boolean;
  fehler?: string;
  hinweis?: string;
}

/**
 * Neues Konto einladen. Supabase verschickt eine E-Mail mit Einmal-Link; ueber
 * /auth/callback landet die Person direkt bei der Passwortvergabe.
 */
export async function benutzerEinladen(
  _vorher: EinladungErgebnis | null,
  formular: FormData,
): Promise<EinladungErgebnis> {
  await adminErzwingen();

  const email = String(formular.get("email") ?? "").trim().toLowerCase();
  const name = String(formular.get("name") ?? "").trim();
  const rolle = String(formular.get("rolle") ?? "fahrer") as Benutzerrolle;

  if (!email) return { ok: false, fehler: "Bitte eine E-Mail-Adresse angeben." };

  const basis = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const admin = adminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, rolle },
    redirectTo: `${basis}/auth/callback?weiter=/passwort-neu`,
  });

  if (error) return { ok: false, fehler: error.message };

  // Der Trigger legt das Profil mit Standardrolle an - hier die gewuenschte
  // Rolle nachziehen.
  if (data.user) {
    await admin.from("benutzerprofil").update({ rolle, name: name || null, email }).eq("id", data.user.id);
  }

  revalidatePath("/intern/benutzer");
  return { ok: true, hinweis: `Einladung an ${email} verschickt.` };
}

export async function rolleAendern(formular: FormData) {
  const ich = await adminErzwingen();

  const id = String(formular.get("id") ?? "");
  const rolle = String(formular.get("rolle") ?? "") as Benutzerrolle;
  if (!id || !rolle) return;

  // Sich selbst die Administratorrolle zu entziehen wuerde das System
  // moeglicherweise ohne Administration zuruecklassen.
  if (id === ich.id && rolle !== "admin") {
    throw new Error("Die eigene Administratorrolle kann nicht entzogen werden.");
  }

  const admin = adminClient();
  await admin.from("benutzerprofil").update({ rolle }).eq("id", id);
  revalidatePath("/intern/benutzer");
}

export async function zugangUmschalten(formular: FormData) {
  const ich = await adminErzwingen();

  const id = String(formular.get("id") ?? "");
  const aktiv = formular.get("aktiv") === "true";
  if (!id) return;
  if (id === ich.id && !aktiv) throw new Error("Das eigene Konto kann nicht gesperrt werden.");

  const admin = adminClient();
  await admin.from("benutzerprofil").update({ aktiv }).eq("id", id);
  revalidatePath("/intern/benutzer");
}

export async function passwortLinkSenden(formular: FormData) {
  await adminErzwingen();

  const email = String(formular.get("email") ?? "").trim();
  if (!email) return;

  const basis = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const admin = adminClient();

  await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${basis}/auth/callback?weiter=/passwort-neu` },
  });

  revalidatePath("/intern/benutzer");
}
