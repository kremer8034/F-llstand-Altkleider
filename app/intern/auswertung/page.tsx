import { serverClient } from "@/lib/supabase/server";
import { containerMitZustand } from "@/lib/daten";
import { Rangliste } from "./Rangliste";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auswertung" };

/**
 * Wie oft muss welcher Container geleert werden?
 *
 * Die Kennzahl ist der mittlere Abstand zwischen zwei Leerungen DESSELBEN
 * Containers - nicht der Durchschnitt ueber alle. Damit laesst sich ablesen,
 * welche Standorte den meisten Fahraufwand verursachen, und daneben steht,
 * wann jeder von ihnen das naechste Mal dran ist.
 */
export default async function AuswertungSeite() {
  const supabase = await serverClient();
  const zeilen = await containerMitZustand(supabase);

  const aktiv = zeilen.filter((z) => z.status === "aktiv");
  const mitRhythmus = aktiv.filter((z) => z.rhythmus?.mittel_tage != null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Auswertung</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Leerungsrhythmus je Container und die Hochrechnung, wann der nächste fällig wird. Der
          Ø-Abstand ist das arithmetische Mittel der Abstände zwischen zwei Leerungen desselben
          Containers; zwei Leerungen dichter als zwölf Stunden beieinander gelten als Korrektur und
          zählen nicht mit.
        </p>
        <p className="mt-1 text-sm text-ink-3">
          {mitRhythmus.length} von {aktiv.length} aktiven Containern haben mindestens zwei erfasste
          Leerungen – nur für die lässt sich ein Rhythmus bilden.
        </p>
      </div>

      <Rangliste
        zeilen={aktiv.map((z) => ({
          id: z.id,
          nummer: z.nummer,
          bezeichnung: z.bezeichnung,
          strasse: z.strasse,
          plz: z.plz,
          ort: z.ort,
          fuellstand_prozent: z.zustand?.fuellstand_prozent ?? null,
          leerungen_gesamt: z.rhythmus?.leerungen_gesamt ?? 0,
          abstaende_anzahl: z.rhythmus?.abstaende_anzahl ?? 0,
          mittel_tage: z.rhythmus?.mittel_tage ?? null,
          streuung_tage: z.rhythmus?.streuung_tage ?? null,
          kuerzester_abstand_tage: z.rhythmus?.kuerzester_abstand_tage ?? null,
          laengster_abstand_tage: z.rhythmus?.laengster_abstand_tage ?? null,
          leerungen_pro_jahr: z.rhythmus?.leerungen_pro_jahr ?? null,
          letzte_leerung_am: z.rhythmus?.letzte_leerung_am ?? null,
          tage_seit_letzter_leerung: z.rhythmus?.tage_seit_letzter_leerung ?? null,
          tage_bis_tour: z.prognose?.tage_bis_tour ?? null,
          prognose_tour_am: z.prognose?.prognose_tour_am ?? null,
        }))}
      />
    </div>
  );
}
