"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { STANDARD_BAUART, geraeteart } from "@/lib/geraetearten";
import { nfceinstellungen, type Sensoreinstellungen } from "@/lib/sensoreinstellungen";

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
  /** Nur beim Eigenbau gesetzt - ein Fertiggeraet kann damit nichts anfangen. */
  geheimnis?: string;
  bauart?: string;
  /** Nur beim Fertiggeraet: was in die NFC-App gehoert. */
  nfc?: Sensoreinstellungen;
}

/**
 * Neues Geraet aufnehmen: Stammsatz, Anlerncode und - beim Eigenbau - das
 * HMAC-Geheimnis.
 *
 * Das Geheimnis wird genau einmal zurueckgegeben - danach steht es nur noch in
 * der Datenbank und ist ueber die Oberflaeche nicht mehr abrufbar. Entweder es
 * wird beim Flashen in die Firmware uebernommen, oder das Geraet holt es sich
 * beim ersten Start selbst ab (siehe /api/geraete/registrieren).
 *
 * Ein Fertiggeraet bekommt keines: es kann unser Signaturverfahren nicht und
 * meldet ueber /api/ingest/webhook (docs/em400-tld.md). Was es stattdessen
 * braucht, ist eine Kennung, unter der es sich meldet - Seriennummer, IMEI
 * oder ICCID.
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

  // Die Bauart entscheidet ueber Messbereich und Annahmeweg. Ein unbekannter
  // Wert aus dem Browser wuerde stillschweigend als Eigenbau durchgehen und
  // dessen Messgrenzen erben - deshalb wird er hier abgewiesen.
  const bauartWert = feld(formular, "bauart") ?? STANDARD_BAUART;
  const art = geraeteart(bauartWert);
  if (!art) return { ok: false, fehler: "Unbekannte Gerätebauart." };

  // Beim Fertiggeraet ist die Geraete-ID die Seriennummer vom Aufkleber -
  // unter ihr meldet es sich. IMEI und ICCID sind zusaetzliche Suchwege, falls
  // die Firmware die Seriennummer nicht mitschickt (siehe lib/messung.ts).
  const iccid = feld(formular, "iccid");
  const imei = feld(formular, "imei");

  const admin = adminClient();

  const { data: sensor, error } = await admin
    .from("sensor")
    .insert({
      geraete_id: geraeteId,
      imei,
      iccid,
      bauart: art.kennung,
      // Messbereich nicht abgefragt, sondern aus der Bauart: er steht im
      // Datenblatt und nicht im Ermessen dessen, der das Geraet aufnimmt.
      // Ein Tippfehler hier liesse gueltige Messwerte als ungueltig
      // durchfallen (0009_geraetevielfalt.sql) - ohne dass jemand merkt,
      // warum der Container "kein Messwert" zeigt.
      mess_min_mm: art.mess_min_mm,
      mess_max_mm: art.mess_max_mm,
      montage_offset_mm: Number(feld(formular, "montage_offset_mm") ?? 0) || 0,
      // Beim Eigenbau holt sich die Firmware diesen Wert ab (/api/ingest).
      // Ein Fertiggeraet wird per NFC eingestellt und liest ihn nie - fuer
      // es ist der Eintrag nur die Notiz, was dort eingestellt wurde.
      intervall_minuten: Number(feld(formular, "intervall_minuten") ?? 360) || 360,
      status: "neu",
    })
    .select("id, geraete_id")
    .single();

  if (error) {
    const doppelt = error.code === "23505";
    return {
      ok: false,
      fehler: doppelt
        ? "Geräte-ID, IMEI oder ICCID gibt es schon an einem anderen Gerät."
        : error.message,
    };
  }

  const code = anlerncodeErzeugen();
  await admin.from("anlerncode").insert({ sensor_id: sensor.id, code });

  // Das HMAC-Geheimnis braucht nur die eigene Firmware. Einem Fertiggeraet
  // eines auszustellen waere ein Schluessel, den nie jemand benutzt - und in
  // der Anzeige ein Arbeitsschritt, den es nicht gibt.
  let geheimnis: string | undefined;
  if (art.annahme === "eigenbau") {
    geheimnis = randomBytes(32).toString("hex");
    await admin.from("sensor_geheimnis").insert({ sensor_id: sensor.id, geheimnis });
  }

  revalidatePath("/intern/sensoren");

  return {
    ok: true,
    geraete_id: sensor.geraete_id,
    anlerncode: code,
    geheimnis,
    bauart: art.kennung,
    // Beim Fertiggeraet ist das der eigentliche naechste Handgriff: die
    // Werte gehoeren jetzt per NFC ins Geraet. Sie hier gleich mitzugeben
    // erspart den Weg ueber eine zweite Seite.
    nfc:
      art.annahme === "webhook"
        ? nfceinstellungen(
            sensor.id,
            sensor.geraete_id,
            Number(feld(formular, "intervall_minuten") ?? 360) || 360,
          )
        : undefined,
  };
}

export interface KopplungErgebnis {
  ok: boolean;
  fehler?: string;
  container_id?: string;
  container_nummer?: string;
  geraete_id?: string;
  kalibriert?: boolean;
  /**
   * Bauart des gekoppelten Geraets. Der Kalibrierschritt erklaert sonst
   * Handgriffe, die es am Geraet nicht gibt: der Eigenbau hat einen Taster
   * und eine LED, ein EM400 nicht (dessen Taster sitzt im Gehaeuse und kann
   * nur neu starten und zuruecksetzen).
   */
  bauart?: string;
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

  const supabase = await serverClient();
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

  // Die Bauart liefert die Datenbankfunktion nicht mit; sie hier nachzuladen
  // ist billiger als die Funktion zu aendern - und der Kalibrierschritt
  // braucht sie, um die richtigen Handgriffe zu zeigen.
  const { data: sensor } = await supabase
    .from("sensor")
    .select("bauart")
    .eq("geraete_id", ergebnis.geraete_id)
    .maybeSingle();

  return {
    ok: true,
    container_id: ergebnis.container_id,
    container_nummer: ergebnis.container_nummer,
    geraete_id: ergebnis.geraete_id,
    kalibriert: ergebnis.kalibriert,
    bauart: (sensor as { bauart?: string } | null)?.bauart,
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
  const supabase = await serverClient();

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

  const supabase = await serverClient();
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
