/**
 * Typen der Tourenplanung.
 *
 * Eigene Datei, weil sowohl die Tagesübersicht als auch die Einzeltour sie
 * brauchen und ein Import quer zwischen zwei `page.tsx` beide aneinander
 * bindet – die eine zöge dann die Datenabfragen der anderen mit.
 */

/** Ein fälliger Stopp aus public.tourenplanung() – Einheit ist der Standort. */
export interface Tourzeile {
  standort_id: string;
  name: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  zufahrt: string | null;
  lat: number | null;
  lng: number | null;
  container_gesamt: number;
  container_voll: number;
  kapazitaet_liter: number | null;
  /** Was hier eingesammelt wird - der gefüllte Anteil. */
  ertrag_liter: number | null;
  freie_liter: number | null;
  freie_prozent: number | null;
  tage_laengster_voll: number | null;
  offene_meldungen: number;
  tage_bis_reserve: number | null;
  reserve_am: string | null;
  naechster_planbesuch_am: string | null;
  routenname: string | null;
  gedeckt: boolean | null;
  zustand: "pflicht" | "kann";
  grund: "zu_lange_voll" | "meldung" | "ungedeckt" | "laeuft_voll" | "mitnahme";
}

export const GRUND_TEXT: Record<Tourzeile["grund"], string> = {
  zu_lange_voll: "steht zu lange voll",
  meldung: "Meldung offen",
  ungedeckt: "keine Regeltour rechtzeitig",
  laeuft_voll: "läuft demnächst über",
  mitnahme: "Regeltour kommt – könnte man mitnehmen",
};

export const TOURSTATUS_TEXT: Record<string, string> = {
  geplant: "geplant",
  laeuft: "unterwegs",
  abgeschlossen: "abgeschlossen",
  abgebrochen: "abgebrochen",
};
