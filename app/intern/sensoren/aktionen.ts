"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";

/** Zeichenvorrat ohne verwechselbare Zeichen (kein 0/O, kein 1/I). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function anlerncodeErzeugen(): string {
  const bytes = randomBytes(8);
  const zeichen = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${zeichen.slice(0, 4)}-${zeichen.slice(4, 8)}`;
}

function feld(formular: FormData, name: string): string | null {
  const wert = formular.get(name);
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim();
  return getrimmt === "" ? null : getrimmt;
}

export interface AnlageErgebnis {
  ok: boolean;
  fehler?: string;
  geraete_id?: string;
  anlerncode?: string;
  geheimnis?: string;
}

/**
 * Neues Geraet aufnehmen: Stammsatz, HMAC-Geheimnis und Anlerncode.
 *
 * Das Geheimnis wird genau einmal zurueckgegeben - danach steht es nur noch in
 * der Datenbank und ist ueber die Oberflaeche nicht mehr abrufbar. Entweder es
 * wird beim Flashen in die Firmware uebernommen, oder das Geraet holt es sich
 * beim ersten Start selbst ab (siehe /api/geraete/registrieren).
 */
export async function sensorAnlegen(_vorher: AnlageErgebnis | null, formular: FormData): Promise<AnlageErgebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  // Erlaubte Rollen aufzaehlen statt die eine verbotene: kaeme eine vierte
  // Rolle hinzu, waere sie sonst stillschweigend berechtigt - und diese Aktion
  // schreibt mit der Service-Role, also an den Zugriffsregeln vorbei.
  if (!darfBearbeiten(benutzer.profil.rolle)) return { ok: false, fehler: "Keine Berechtigung." };

  const geraeteId = feld(formular, "geraete_id");
  if (!geraeteId) return { ok: false, fehler: "Die Geräte-ID ist ein Pflichtfeld." };

  const admin = adminClient();

  const { data: sensor, error } = await admin
    .from("sensor")
    .insert({
      geraete_id: geraeteId,
      imei: feld(formular, "imei"),
      iccid: feld(formular, "iccid"),
      mobilfunkanbieter: feld(formular, "mobilfunkanbieter"),
      hardware_rev: feld(formular, "hardware_rev"),
      montage_offset_mm: Number(feld(formular, "montage_offset_mm") ?? 0) || 0,
      intervall_minuten: Number(feld(formular, "intervall_minuten") ?? 360) || 360,
      bemerkung: feld(formular, "bemerkung"),
      status: "neu",
    })
    .select("id, geraete_id")
    .single();

  if (error) {
    const doppelt = error.code === "23505";
    return { ok: false, fehler: doppelt ? "Diese Geräte-ID gibt es bereits." : error.message };
  }

  const geheimnis = randomBytes(32).toString("hex");
  const code = anlerncodeErzeugen();

  await admin.from("sensor_geheimnis").insert({ sensor_id: sensor.id, geheimnis });
  await admin.from("anlerncode").insert({ sensor_id: sensor.id, code });

  revalidatePath("/intern/sensoren");

  return { ok: true, geraete_id: sensor.geraete_id, anlerncode: code, geheimnis };
}

export interface KopplungErgebnis {
  ok: boolean;
  fehler?: string;
  container_id?: string;
  container_nummer?: string;
  geraete_id?: string;
  kalibriert?: boolean;
}

/** Schritt 2 des Anlernens: Sensor und Container verheiraten. */
export async function sensorKoppeln(
  _vorher: KopplungErgebnis | null,
  formular: FormData,
): Promise<KopplungErgebnis> {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");

  const code = feld(formular, "anlerncode");
  const containerId = feld(formular, "container_id");

  if (!code) return { ok: false, fehler: "Bitte den Anlerncode scannen oder eingeben." };
  if (!containerId) return { ok: false, fehler: "Bitte einen Container auswählen." };

  const supabase = serverClient();
  const { data, error } = await supabase.rpc("sensor_koppeln", {
    p_anlerncode: code,
    p_container_id: containerId,
    p_gps_lat: Number(feld(formular, "gps_lat") ?? "") || null,
    p_gps_lng: Number(feld(formular, "gps_lng") ?? "") || null,
    p_ersetzen: formular.get("ersetzen") === "on",
    p_notiz: feld(formular, "notiz"),
  });

  if (error) return { ok: false, fehler: error.message };

  revalidatePath("/intern/sensoren");
  revalidatePath(`/intern/container/${containerId}`);

  const ergebnis = data as {
    container_id: string;
    container_nummer: string;
    geraete_id: string;
    kalibriert: boolean;
  };

  return {
    ok: true,
    container_id: ergebnis.container_id,
    container_nummer: ergebnis.container_nummer,
    geraete_id: ergebnis.geraete_id,
    kalibriert: ergebnis.kalibriert,
  };
}

/** Schritt 3: Leerwert uebernehmen oder von Hand setzen. */
export async function kalibrierungSetzen(
  _vorher: { ok: boolean; fehler?: string; leer?: number; voll?: number } | null,
  formular: FormData,
) {
  const containerId = feld(formular, "container_id");
  if (!containerId) return { ok: false, fehler: "Kein Container ausgewählt." };

  const leer = feld(formular, "leer_abstand_mm");
  const supabase = serverClient();

  const { data, error } = await supabase.rpc("container_kalibrieren", {
    p_container_id: containerId,
    p_leer_abstand_mm: leer ? Number(leer) : null,
    p_voll_abstand_mm: null,
  });

  if (error) return { ok: false, fehler: error.message };

  revalidatePath(`/intern/container/${containerId}`);
  const werte = data as { leer_abstand_mm: number; voll_abstand_mm: number };
  return { ok: true, leer: werte.leer_abstand_mm, voll: werte.voll_abstand_mm };
}

export async function sensorEntkoppeln(formular: FormData) {
  const sensorId = feld(formular, "sensor_id");
  if (!sensorId) return;

  const supabase = serverClient();
  const { error } = await supabase.rpc("sensor_entkoppeln", {
    p_sensor_id: sensorId,
    p_notiz: feld(formular, "notiz"),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/intern/sensoren");
}

/** Neuen Anlerncode ausstellen, falls der Aufkleber verloren ging. */
export async function anlerncodeNeu(formular: FormData) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) redirect("/login");
  if (!darfBearbeiten(benutzer.profil.rolle)) return;

  const sensorId = feld(formular, "sensor_id");
  if (!sensorId) return;

  const admin = adminClient();
  await admin.from("anlerncode").insert({ sensor_id: sensorId, code: anlerncodeErzeugen() });
  revalidatePath("/intern/sensoren");
}
