"use server";

import { randomBytes } from "node:crypto";
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

const ROLLEN: Benutzerrolle[] = ["admin", "dispo", "fahrer"];

/**
 * Rolle aus dem Formular prüfen.
 *
 * Die Auswahl steht im Browser und ist damit veränderbar. Ein unbekannter Wert
 * würde als Aufzählungstyp in der Datenbank auflaufen - und weil das Ergebnis
 * der Aktualisierung bisher nicht ausgewertet wurde, bliebe das Konto still
 * auf seiner alten Rolle stehen.
 */
function rolleLesen(wert: FormDataEntryValue | null): Benutzerrolle | null {
  const text = String(wert ?? "");
  return (ROLLEN as string[]).includes(text) ? (text as Benutzerrolle) : null;
}


/** Zeichenvorrat ohne verwechselbare Zeichen - das Passwort wird oft vorgelesen. */
const PASSWORT_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Lesbares Startpasswort, z. B. "kR4m-7Ptq-9Wxz". */
export async function passwortVorschlagen(): Promise<string> {
  // Auch ein blosser Vorschlag ist von aussen aufrufbar, sobald er als
  // Server-Aktion ausgefuehrt wird - deshalb dieselbe Huerde wie ueberall hier.
  await adminErzwingen();

  const bytes = randomBytes(12);
  const zeichen = Array.from(bytes, (b) => PASSWORT_ALPHABET[b % PASSWORT_ALPHABET.length]).join("");
  return `${zeichen.slice(0, 4)}-${zeichen.slice(4, 8)}-${zeichen.slice(8, 12)}`;
}

export interface AnlageErgebnis {
  ok: boolean;
  fehler?: string;
  email?: string;
  passwort?: string;
}

/**
 * Zugang direkt anlegen - ohne E-Mail.
 *
 * Der Weg ueber eine Einladungsmail setzt voraus, dass die Person eine eigene
 * Adresse hat und der Mailversand eingerichtet ist. Beim Fahrpersonal trifft
 * oft beides nicht zu. Hier vergibt die Administration deshalb gleich ein
 * Startpasswort und gibt es persoenlich weiter; geaendert wird es danach
 * ueber "Passwort vergessen?" oder erneut hier.
 */
export async function benutzerAnlegen(
  _vorher: AnlageErgebnis | null,
  formular: FormData,
): Promise<AnlageErgebnis> {
  await adminErzwingen();

  const email = String(formular.get("email") ?? "").trim().toLowerCase();
  const name = String(formular.get("name") ?? "").trim();
  const rolle = rolleLesen(formular.get("rolle"));
  const passwort = String(formular.get("passwort") ?? "").trim();

  if (!email) return { ok: false, fehler: "Bitte eine E-Mail-Adresse angeben." };
  if (!rolle) return { ok: false, fehler: "Bitte eine gültige Rolle auswählen." };
  if (passwort.length < 10) return { ok: false, fehler: "Das Startpasswort braucht mindestens zehn Zeichen." };

  const admin = adminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: passwort,
    // Ohne Bestaetigung koennte sich die Person nicht anmelden, und eine
    // Bestaetigungsmail wollen wir hier ja gerade vermeiden.
    email_confirm: true,
    // Nur der Anzeigename geht in die Anmeldedaten. Die Rolle wird gleich
    // darunter gesetzt: der Datenbank-Trigger liest sie bewusst nicht mehr aus
    // den Anmeldedaten, weil dieses Feld sonst jeder selbst bestimmen koennte.
    user_metadata: { name },
  });

  if (error) {
    const bekannt = /already|registered|exists/i.test(error.message);
    return {
      ok: false,
      fehler: bekannt ? "Für diese E-Mail-Adresse gibt es bereits einen Zugang." : error.message,
    };
  }

  if (data.user) {
    const { error: profilFehler } = await admin
      .from("benutzerprofil")
      .update({ rolle, name: name || null, email })
      .eq("id", data.user.id);

    // Der Zugang steht dann schon, traegt aber die Standardrolle - das muss
    // sichtbar sein, sonst sucht man den Fehler spaeter in der Berechtigung.
    if (profilFehler) {
      return {
        ok: false,
        fehler:
          `Der Zugang für ${email} wurde angelegt, die Rolle konnte aber nicht gesetzt werden ` +
          `(${profilFehler.message}). Bitte sie in der Liste nachtragen.`,
      };
    }
  }

  revalidatePath("/intern/benutzer");
  return { ok: true, email, passwort };
}

/** Passwort eines bestehenden Zugangs neu setzen - ebenfalls ohne E-Mail. */
export async function passwortNeuSetzen(
  _vorher: AnlageErgebnis | null,
  formular: FormData,
): Promise<AnlageErgebnis> {
  await adminErzwingen();

  const id = String(formular.get("id") ?? "");
  const passwort = String(formular.get("passwort") ?? "").trim();

  if (!id) return { ok: false, fehler: "Kein Konto ausgewählt." };
  if (passwort.length < 10) return { ok: false, fehler: "Das Passwort braucht mindestens zehn Zeichen." };

  const admin = adminClient();
  const { error } = await admin.auth.admin.updateUserById(id, { password: passwort });

  if (error) return { ok: false, fehler: error.message };

  revalidatePath("/intern/benutzer");
  return { ok: true, passwort };
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
  const rolle = rolleLesen(formular.get("rolle"));

  if (!email) return { ok: false, fehler: "Bitte eine E-Mail-Adresse angeben." };
  if (!rolle) return { ok: false, fehler: "Bitte eine gültige Rolle auswählen." };

  const basis = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const admin = adminClient();

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    // Wie beim direkten Anlegen: nur der Anzeigename, die Rolle setzt der
    // naechste Schritt mit der Service-Role.
    data: { name },
    redirectTo: `${basis}/auth/callback?weiter=/passwort-neu`,
  });

  if (error) {
    // 429 heisst hier fast immer: der eingebaute Mailversand von Supabase ist
    // ausgereizt (wenige Mails je Stunde, nur an Team-Adressen). Ohne eigenen
    // Mailserver ist "Zugang direkt anlegen" der verlaessliche Weg.
    const gedrosselt = error.status === 429 || /rate limit/i.test(error.message);
    return {
      ok: false,
      fehler: gedrosselt
        ? "Der Mailversand ist ausgereizt (Supabase begrenzt ihn ohne eigenen Mailserver stark). " +
          "Legen Sie den Zugang stattdessen direkt mit Startpasswort an."
        : error.message,
    };
  }

  // Der Trigger legt das Profil mit Standardrolle an - hier die gewuenschte
  // Rolle nachziehen.
  if (data.user) {
    const { error: profilFehler } = await admin
      .from("benutzerprofil")
      .update({ rolle, name: name || null, email })
      .eq("id", data.user.id);

    if (profilFehler) {
      return {
        ok: false,
        fehler:
          `Die Einladung an ${email} ist unterwegs, die Rolle konnte aber nicht gesetzt werden ` +
          `(${profilFehler.message}). Bitte sie in der Liste nachtragen.`,
      };
    }
  }

  revalidatePath("/intern/benutzer");
  return { ok: true, hinweis: `Einladung an ${email} verschickt.` };
}

export async function rolleAendern(formular: FormData) {
  const ich = await adminErzwingen();

  const id = String(formular.get("id") ?? "");
  const rolle = rolleLesen(formular.get("rolle"));
  if (!id) return;
  if (!rolle) throw new Error("Unbekannte Rolle.");

  // Sich selbst die Administratorrolle zu entziehen wuerde das System
  // moeglicherweise ohne Administration zuruecklassen.
  if (id === ich.id && rolle !== "admin") {
    throw new Error("Die eigene Administratorrolle kann nicht entzogen werden.");
  }

  const admin = adminClient();
  const { error } = await admin.from("benutzerprofil").update({ rolle }).eq("id", id);
  if (error) throw new Error(`Die Rolle konnte nicht geändert werden: ${error.message}`);

  revalidatePath("/intern/benutzer");
}

export async function zugangUmschalten(formular: FormData) {
  const ich = await adminErzwingen();

  const id = String(formular.get("id") ?? "");
  const aktiv = formular.get("aktiv") === "true";
  if (!id) return;
  if (id === ich.id && !aktiv) throw new Error("Das eigene Konto kann nicht gesperrt werden.");

  const admin = adminClient();
  const { error } = await admin.from("benutzerprofil").update({ aktiv }).eq("id", id);
  if (error) throw new Error(`Der Zugang konnte nicht umgestellt werden: ${error.message}`);

  revalidatePath("/intern/benutzer");
}

// Frueher stand hier passwortLinkSenden(): eine Aktion, die per
// admin.generateLink() einen Wiederherstellungslink erzeugte, ihn dann aber
// wegwarf. generateLink verschickt nichts, es gibt den Link nur zurueck - es
// wurde also nie eine Mail versendet, und aufgerufen wurde die Aktion von
// keiner Oberflaeche. Wer sein Passwort vergessen hat, nimmt "Passwort
// vergessen?" auf der Anmeldeseite; ohne erreichbares Postfach setzt die
// Administration es oben mit passwortNeuSetzen() direkt.
