import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { rhythmusText } from "@/lib/wochentage";
import type { Benutzerprofil, Gruppe, Route, Standort } from "@/lib/typen";
import { ROLLEN_TEXT } from "@/lib/rollen";
import { Gruppenverwaltung, type Gruppenzeile } from "./Gruppenverwaltung";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bereitschaften" };

export default async function GruppenSeite() {
  await rolleErzwingen(["admin"]);
  const supabase = await serverClient();

  const [gruppenAntwort, standortAntwort, routenAntwort, rechteAntwort, profilAntwort] =
    await Promise.all([
      supabase.from("gruppe").select("*").order("name"),
      supabase.from("standort").select("id, name, ort, gruppe_id").eq("aktiv", true).order("name"),
      supabase.from("route").select("*").order("name"),
      supabase.from("benutzer_gruppe").select("benutzer_id, gruppe_id"),
      supabase.from("benutzerprofil").select("id, name, email, rolle").order("name"),
    ]);

  const gruppen = (gruppenAntwort.data ?? []) as Gruppe[];
  const standorte = (standortAntwort.data ?? []) as Pick<
    Standort,
    "id" | "name" | "ort" | "gruppe_id"
  >[];
  const routen = (routenAntwort.data ?? []) as Route[];
  const rechte = (rechteAntwort.data ?? []) as { benutzer_id: string; gruppe_id: string }[];
  const profile = (profilAntwort.data ?? []) as Pick<
    Benutzerprofil,
    "id" | "name" | "email" | "rolle"
  >[];

  const profilJeId = new Map(profile.map((p) => [p.id, p]));

  const zeilen: Gruppenzeile[] = gruppen.map((g) => ({
    ...g,
    standorte: standorte.filter((s) => s.gruppe_id === g.id).length,
    regeltouren: routen.filter((r) => r.gruppe_id === g.id).length,
    benutzer: rechte
      .filter((r) => r.gruppe_id === g.id)
      .map((r) => {
        const p = profilJeId.get(r.benutzer_id);
        return {
          id: r.benutzer_id,
          name: p?.name || (p?.email ?? "unbekannter Zugang"),
          rolle: p ? ROLLEN_TEXT[p.rolle] : "?",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "de")),
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bereitschaften</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Eine Bereitschaft betreut eigene Standorte und fährt eigene Touren. Wer einer
          Bereitschaft zugeordnet ist, sieht und plant nur deren Plätze und Touren – so kommen sich
          zwei Dispositionen nicht ins Gehege und ändern einander nicht die Fahraufträge.
        </p>
        <p className="mt-1 max-w-3xl text-sm text-ink-3">
          Zwei Regeln, damit das Einschalten nichts umwirft: <strong>wer keiner Bereitschaft
          zugeordnet ist, sieht alles</strong> – die Einschränkung entsteht erst mit der Zuordnung
          eines Zugangs unter{" "}
          <span className="zahl">Benutzer</span>. Und <strong>was keiner Bereitschaft zugeordnet
          ist, sehen alle</strong>: ein Platz ohne Bereitschaft ist gemeinsame Sache, nicht
          Niemandsland. Die Administration sieht ohnehin immer alles.
        </p>
      </div>

      <Gruppenverwaltung
        gruppen={zeilen}
        standorte={standorte.map((s) => ({
          id: s.id,
          name: s.name,
          ort: s.ort,
          gruppe_id: s.gruppe_id,
        }))}
        regeltouren={routen.map((r) => ({
          id: r.id,
          name: r.name,
          rhythmus: rhythmusText(r.wochentag, r.intervall_wochen),
          gruppe_id: r.gruppe_id,
        }))}
        standorteOhneGruppe={standorte.filter((s) => s.gruppe_id === null).length}
        routenOhneGruppe={routen.filter((r) => r.gruppe_id === null).length}
      />
    </div>
  );
}
