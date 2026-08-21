export type Benutzerrolle = "admin" | "dispo" | "fahrer";
export type ContainerStatus = "aktiv" | "inaktiv" | "defekt" | "entfernt";
export type SensorStatus = "neu" | "angelernt" | "wartung" | "defekt" | "ausser_betrieb";
export type Messanlass = "intervall" | "test" | "taster" | "schwellwert" | "neustart";
export type Alarmtyp = "fuellstand" | "kein_signal" | "batterie_schwach" | "messfehler";
export type Meldungstyp = "voll" | "beschaedigt" | "vermuellt" | "zugeparkt" | "sonstiges";
export type Fuellstandsstufe = "frei" | "teilweise" | "hoch" | "voll" | "unbekannt";

export interface Benutzerprofil {
  id: string;
  name: string;
  email: string | null;
  rolle: Benutzerrolle;
  telefon: string | null;
  aktiv: boolean;
  angelegt_am: string;
}

export interface Container {
  id: string;
  nummer: string;
  externe_id: string | null;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number | null;
  lng: number | null;
  typ: string;
  volumen_liter: number | null;
  betreiber: string;
  leer_abstand_mm: number | null;
  voll_abstand_mm: number | null;
  status: ContainerStatus;
  oeffentlich: boolean;
  aufstelldatum: string | null;
  bemerkung: string | null;
}

export interface ContainerZustand {
  container_id: string;
  sensor_id: string | null;
  fuellstand_prozent: number | null;
  abstand_mm: number | null;
  gemessen_am: string | null;
  batterie_v: number | null;
  rssi: number | null;
}

export interface Sensor {
  id: string;
  geraete_id: string;
  imei: string | null;
  iccid: string | null;
  hardware_rev: string | null;
  firmware: string | null;
  container_id: string | null;
  status: SensorStatus;
  montage_offset_mm: number;
  intervall_minuten: number;
  letzte_meldung_am: string | null;
  batterie_v: number | null;
  rssi: number | null;
  angelernt_am: string | null;
  bemerkung: string | null;
}

export interface Messung {
  id: number;
  sensor_id: string;
  container_id: string | null;
  gemessen_am: string;
  abstand_mm: number | null;
  fuellstand_prozent: number | null;
  batterie_v: number | null;
  temperatur_c: number | null;
  rssi: number | null;
  anlass: Messanlass;
  gueltig: boolean;
}

export interface Leerung {
  id: string;
  container_id: string;
  geleert_am: string;
  fuellstand_vorher: number | null;
  fuellstand_nachher: number | null;
  art: "automatisch" | "manuell";
  menge_kg: number | null;
  notiz: string | null;
}

export interface Alarm {
  id: string;
  container_id: string | null;
  sensor_id: string | null;
  typ: Alarmtyp;
  ausgeloest_am: string;
  wert: number | null;
  text: string | null;
  quittiert_am: string | null;
  geschlossen_am: string | null;
}

/** Zeile der oeffentlichen Kartenansicht (ohne Anmeldung abrufbar). */
export interface OeffentlicherContainer {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number;
  lng: number;
  typ: string;
  aufstelldatum: string | null;
  standtage: number | null;
  fuellstand_prozent: number | null;
  stufe: Fuellstandsstufe;
  gemessen_am: string | null;
  stunden_seit_messung: number | null;
}
