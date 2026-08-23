import { serverClient } from "@/lib/supabase/server";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { kostensaetzeAus, type Kostensaetze } from "@/lib/kosten";
import { Tourenansicht } from "./Tourenansicht";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tour" };

/** Ein Stopp der Tourenplanung - Einheit ist der Standort, nicht der Container. */
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

/** Optionaler fester Ausgangspunkt der Tour (Einstellung "betriebshof"). */
function betriebshofLesen(werte: Record<string, unknown>) {
  const wert = werte["betriebshof"];
  if (!wert || typeof wert !== "object") return null;

  const { lat, lng, name } = wert as { lat?: unknown; lng?: unknown; name?: unknown };
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return { lat, lng, name: typeof name === "string" ? name : "Betriebshof" };
}

export default async function TourenSeite() {
  const supabase = await serverClient();
  const [antwort, werte] = await Promise.all([supabase.rpc("tourenplanung"), einstellungen(supabase)]);

  const zeilen = (antwort.data ?? []) as Tourzeile[];
  const reserve = zahlAusEinstellung(werte, "standort_reserve_prozent", 20);
  const maxTageVoll = zahlAusEinstellung(werte, "max_tage_ueber_schwelle", 7);
  const saetze: Kostensaetze = kostensaetzeAus(werte);

  const pflicht = zeilen.filter((z) => z.zustand === "pflicht").length;
  const kann = zeilen.length - pflicht;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Nächste Tour</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Geplant wird in Stopps, nicht in Containern: ein Standort wird als Ganzes angefahren und
          geleert. <strong>{pflicht} Stopps müssen heute mit</strong>
          {kann > 0 && (
            <>
              , {kann} weitere könnten mitgenommen werden – ob sich das lohnt, entscheidet der Umweg
            </>
          )}
          .
        </p>
        <p className="mt-1 text-sm text-ink-3">
          Ein Standort gilt als fällig, wenn weniger als {reserve} % Restkapazität frei sind, eine
          Meldung offen ist, ein Container länger als {maxTageVoll} Tage voll steht – oder keine
          Regeltour rechtzeitig vorbeikommt.
        </p>
      </div>

      {antwort.error && (
        <p className="karte-flaeche p-4 text-sm text-ink-2">
          Die Tourenplanung konnte nicht geladen werden: {antwort.error.message}
        </p>
      )}

      <Tourenansicht zeilen={zeilen} betriebshof={betriebshofLesen(werte)} saetze={saetze} />
    </div>
  );
}
