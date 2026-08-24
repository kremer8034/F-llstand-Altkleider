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
  standort_id: string | null;
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
  bauart: string;
  montage_offset_mm: number;
  mess_min_mm: number;
  mess_max_mm: number;
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
  /** Der Platz, zu dem dieser Container gehoert. */
  standort_id: string | null;
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

export type Prognosegrundlage = "messung_und_historie" | "messung" | "historie" | "keine";

/** Hochrechnung je Container - Ansicht public.container_prognose. */
export interface ContainerPrognose {
  container_id: string;
  nummer: string;
  fuellstand_prozent: number | null;
  gemessen_am: string | null;
  /** Anstieg im laufenden Zyklus, Prozentpunkte je Tag. */
  rate_messung: number | null;
  /** Anstieg, der sich aus dem bisherigen Rhythmus ergibt. */
  rate_historie: number | null;
  /** Aus beidem gemischt - damit wird gerechnet. */
  rate_prozent_pro_tag: number | null;
  tage_bis_tour: number | null;
  tage_bis_voll: number | null;
  prognose_tour_am: string | null;
  prognose_voll_am: string | null;
  grundlage: Prognosegrundlage;
}

/** Leerungsrhythmus je Container - Ansicht public.container_rhythmus. */
export interface ContainerRhythmus {
  container_id: string;
  nummer: string;
  leerungen_gesamt: number;
  abstaende_anzahl: number;
  erste_leerung_am: string | null;
  letzte_leerung_am: string | null;
  tage_seit_letzter_leerung: number | null;
  /** Arithmetisches Mittel der Abstaende zwischen zwei Leerungen. */
  mittel_tage: number | null;
  streuung_tage: number | null;
  kuerzester_abstand_tage: number | null;
  laengster_abstand_tage: number | null;
  leerungen_pro_jahr: number | null;
}

/** Platz, an dem ein oder mehrere Container stehen - Einheit der Tourenplanung. */
export interface Standort {
  id: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number | null;
  lng: number | null;
  zufahrt: string | null;
  bemerkung: string | null;
  /** Zustaendiger Bauhof. Nicht gesetzt heisst: der Muell wird mitgenommen. */
  entsorger_id: string | null;
  /** Betreuende Bereitschaft. Nicht gesetzt heisst: gemeinsame Zustaendigkeit. */
  gruppe_id: string | null;
  aktiv: boolean;
  angelegt_am: string;
}

/** Ansicht public.standort_zustand - Restkapazitaet statt Fuellstand. */
export interface StandortZustand {
  standort_id: string;
  name: string;
  ort: string | null;
  aktiv: boolean;
  lat: number | null;
  lng: number | null;
  container_gesamt: number;
  container_mit_sensor: number;
  container_ohne_wert: number;
  kapazitaet_liter: number | null;
  gefuellt_liter: number | null;
  freie_liter: number | null;
  freie_prozent: number | null;
  zufluss_liter_je_tag: number | null;
  container_voll: number;
  tage_laengster_voll: number | null;
  offene_meldungen: number;
}

/** Regeltour mit festem Rhythmus: Wochentag, Wochenabstand, Ankerdatum. */
export interface Route {
  id: string;
  name: string;
  farbe: string | null;
  /** ISO-Wochentag: 1 = Montag ... 7 = Sonntag. */
  wochentag: number;
  intervall_wochen: number;
  anker_datum: string;
  /** Bereitschaft, die diese Regeltour faehrt. */
  gruppe_id: string | null;
  aktiv: boolean;
  bemerkung: string | null;
  angelegt_am: string;
}

export type Planungszustand = "pflicht" | "kann" | "ruht";

/** Ansicht public.standort_planung - Deckung, Aufschub und Einstufung. */
export interface StandortPlanung {
  standort_id: string;
  name: string;
  ort: string | null;
  lat: number | null;
  lng: number | null;
  container_gesamt: number;
  container_voll: number;
  kapazitaet_liter: number | null;
  gefuellt_liter: number | null;
  freie_liter: number | null;
  freie_prozent: number | null;
  zufluss_liter_je_tag: number | null;
  tage_laengster_voll: number | null;
  offene_meldungen: number;
  naechster_planbesuch_am: string | null;
  routenname: string | null;
  tage_bis_reserve: number | null;
  reserve_am: string | null;
  gedeckt: boolean | null;
  zustand: Planungszustand;
  grund: string;
}

// ---------------------------------------------------------------------------
// Entsorgung (0014_entsorger.sql)
// ---------------------------------------------------------------------------

/** Bauhof oder Entsorgungsbetrieb, der Fremdmuell aus den Containern abholt. */
export interface Entsorger {
  id: string;
  name: string;
  gemeinde: string | null;
  telefon: string | null;
  email: string | null;
  ansprechpartner: string | null;
  erreichbar: string | null;
  bemerkung: string | null;
  aktiv: boolean;
  angelegt_am: string;
}

/**
 * Ansicht public.standort_entsorgung - was das Fahrpersonal am Stopp braucht.
 * `abholung_vereinbart = false` heisst: der Muell muss mit.
 */
export interface StandortEntsorgung {
  standort_id: string;
  standort_name: string;
  ort: string | null;
  entsorger_id: string | null;
  entsorger_name: string | null;
  telefon: string | null;
  email: string | null;
  ansprechpartner: string | null;
  erreichbar: string | null;
  entsorger_bemerkung: string | null;
  abholung_vereinbart: boolean;
}

// ---------------------------------------------------------------------------
// Tagestouren (0015_touren.sql)
// ---------------------------------------------------------------------------

export type Tourstatus = "geplant" | "laeuft" | "abgeschlossen" | "abgebrochen";
export type Stoppstatus = "offen" | "erledigt" | "uebersprungen";

/** Ein Fahrauftrag: ein Tag, ein Fahrer, eine Folge von Stopps. */
export interface Tour {
  id: string;
  name: string | null;
  datum: string;
  route_id: string | null;
  fahrer_id: string | null;
  /** Bereitschaft, die diesen Fahrauftrag faehrt. */
  gruppe_id: string | null;
  status: Tourstatus;
  begonnen_am: string | null;
  abgeschlossen_am: string | null;
  bemerkung: string | null;
  angelegt_von: string | null;
  angelegt_am: string;
}

export interface TourStopp {
  id: string;
  tour_id: string;
  standort_id: string;
  position: number;
  status: Stoppstatus;
  angekommen_am: string | null;
  erledigt_am: string | null;
  erledigt_von: string | null;
  notiz: string | null;
}

export interface TourContainer {
  id: string;
  stopp_id: string;
  container_id: string;
  geleert: boolean;
  grund: string | null;
  menge_kg: number | null;
  leerung_id: string | null;
  erfasst_am: string;
}

/** Ansicht public.tour_fortschritt - Zustand einer Tour ohne Fahrzeugposition. */
export interface TourFortschritt {
  tour_id: string;
  name: string | null;
  datum: string;
  status: Tourstatus;
  route_id: string | null;
  routenname: string | null;
  fahrer_id: string | null;
  fahrername: string | null;
  begonnen_am: string | null;
  abgeschlossen_am: string | null;
  stopps_gesamt: number;
  stopps_erledigt: number;
  stopps_uebersprungen: number;
  stopps_offen: number;
  naechster_standort_id: string | null;
  naechster_standort: string | null;
  container_geleert: number;
  container_stehen_geblieben: number;
}

// ---------------------------------------------------------------------------
// Oeffentliche Platzliste (0016_adresse_am_standort.sql)
// ---------------------------------------------------------------------------

/**
 * Ein Platz auf der oeffentlichen Karte. Fuer den Buerger ist ein Parkplatz
 * mit drei Containern eine Antwort, nicht drei.
 */
export interface OeffentlicherStandort {
  standort_id: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  lat: number;
  lng: number;
  container_gesamt: number;
  container_mit_platz: number;
  freie_prozent: number | null;
  stufe: Fuellstandsstufe;
  gemessen_am: string | null;
  stunden_seit_messung: number | null;
}

// ---------------------------------------------------------------------------
// Bereitschaften (0019_gruppen.sql)
// ---------------------------------------------------------------------------

/**
 * Organisationseinheit ueber Standorten und Touren. Beim BRK heisst sie
 * "Bereitschaft": sie betreut eigene Plaetze und faehrt eigene Touren.
 */
export interface Gruppe {
  id: string;
  name: string;
  ansprechpartner: string | null;
  telefon: string | null;
  email: string | null;
  bemerkung: string | null;
  aktiv: boolean;
  angelegt_am: string;
}

/** Berechtigung eines Kontos fuer eine Bereitschaft. */
export interface BenutzerGruppe {
  benutzer_id: string;
  gruppe_id: string;
  angelegt_am: string;
}
