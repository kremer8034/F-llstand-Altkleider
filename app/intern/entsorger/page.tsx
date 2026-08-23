import { serverClient } from "@/lib/supabase/server";
import { rolleErzwingen } from "@/lib/auth";
import type { Entsorger } from "@/lib/typen";
import { Entsorgerverwaltung } from "./Entsorgerverwaltung";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bauhöfe" };

export default async function EntsorgerSeite() {
  await rolleErzwingen(["admin", "dispo"]);
  const supabase = await serverClient();

  const [entsorgerAntwort, standortAntwort] = await Promise.all([
    supabase.from("entsorger").select("*").order("gemeinde").order("name"),
    supabase.from("standort").select("id, ort, entsorger_id").eq("aktiv", true),
  ]);

  const entsorger = (entsorgerAntwort.data ?? []) as Entsorger[];
  const standorte = (standortAntwort.data ?? []) as {
    id: string;
    ort: string | null;
    entsorger_id: string | null;
  }[];

  // Wie viele Standorte hängen an jedem Bauhof?
  const zugeordnet = new Map<string, number>();
  standorte.forEach((s) => {
    if (s.entsorger_id) zugeordnet.set(s.entsorger_id, (zugeordnet.get(s.entsorger_id) ?? 0) + 1);
  });

  // Gemeinden, in denen Standorte ohne Bauhof stehen. Das ist die Arbeitsliste:
  // an genau diesen Plätzen nimmt das Fahrpersonal den Müll mit.
  const offeneGemeinden = new Map<string, number>();
  standorte
    .filter((s) => !s.entsorger_id)
    .forEach((s) => {
      const ort = s.ort ?? "ohne Ort";
      offeneGemeinden.set(ort, (offeneGemeinden.get(ort) ?? 0) + 1);
    });

  const ohneZuordnung = standorte.filter((s) => !s.entsorger_id).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bauhöfe und Entsorger</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Wer holt den Fremdmüll ab, der im Altkleidercontainer landet? Mit den Gemeinden bestehen
          Absprachen: liegt Restmüll im Container, bleibt er stehen und der Bauhof wird gerufen. Wo
          keine Absprache hinterlegt ist, nimmt das Fahrpersonal den Müll mit.
        </p>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">
          Die Kontaktdaten stehen einmal je Bauhof, nicht an jedem Standort – sonst müsste dieselbe
          Rufnummer bei jeder Änderung an dreißig Stellen nachgezogen werden. Am Standort steht nur
          der Verweis.
        </p>
      </div>

      <Entsorgerverwaltung
        entsorger={entsorger}
        zugeordnet={Object.fromEntries(zugeordnet)}
        offeneGemeinden={[...offeneGemeinden.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([gemeinde, anzahl]) => ({ gemeinde, anzahl }))}
        ohneZuordnung={ohneZuordnung}
        standorteGesamt={standorte.length}
      />
    </div>
  );
}
