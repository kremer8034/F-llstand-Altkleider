import { rolleErzwingen } from "@/lib/auth";
import { ROLLEN_TEXT } from "@/lib/rollen";
import { serverClient } from "@/lib/supabase/server";
import { formatDatum } from "@/lib/fuellstand";
import type { Benutzerprofil } from "@/lib/typen";
import { Einladungsformular } from "./Einladungsformular";
import { rolleAendern, zugangUmschalten } from "./aktionen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Benutzer" };

export default async function BenutzerSeite() {
  const ich = await rolleErzwingen(["admin"]);

  const supabase = serverClient();
  const { data } = await supabase.from("benutzerprofil").select("*").order("name");
  const profile = (data ?? []) as Benutzerprofil[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Benutzer</h1>
        <p className="mt-1 text-sm text-ink-2">
          Administration darf alles, Disposition alles außer Benutzerverwaltung, Fahrpersonal liest
          und erfasst Leerungen, Meldungen und Sensoren.
        </p>
      </div>

      <Einladungsformular />

      <div className="karte-flaeche overflow-x-auto">
        <table className="tabelle">
          <thead>
            <tr>
              <th>Name</th>
              <th>E-Mail</th>
              <th>Rolle</th>
              <th>Angelegt</th>
              <th className="text-right">Zugang</th>
            </tr>
          </thead>
          <tbody>
            {profile.map((p) => (
              <tr key={p.id} className={p.aktiv ? "" : "opacity-50"}>
                <td className="font-medium">
                  {p.name || "–"}
                  {p.id === ich.id && <span className="ml-2 text-xs text-ink-3">(Sie)</span>}
                </td>
                <td className="text-ink-2">{p.email ?? "–"}</td>
                <td>
                  <form action={rolleAendern} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <select name="rolle" defaultValue={p.rolle} className="feld w-auto py-1 text-sm">
                      {(["admin", "dispo", "fahrer"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLLEN_TEXT[r]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs underline underline-offset-2">
                      übernehmen
                    </button>
                  </form>
                </td>
                <td className="text-ink-3">{formatDatum(p.angelegt_am)}</td>
                <td className="text-right">
                  <form action={zugangUmschalten}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="aktiv" value={String(!p.aktiv)} />
                    <button
                      type="submit"
                      disabled={p.id === ich.id}
                      className="knopf-sekundaer px-3 py-1"
                    >
                      {p.aktiv ? "Sperren" : "Freigeben"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-3">
        Wer sein Passwort vergessen hat, setzt es selbst über „Passwort vergessen?“ auf der
        Anmeldeseite zurück – dafür ist kein Eingriff der Administration nötig.
      </p>
    </div>
  );
}
