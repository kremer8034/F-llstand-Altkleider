import { rolleErzwingen } from "@/lib/auth";
import { Importbereich } from "./Importbereich";

export const metadata = { title: "Import" };

export default async function ImportSeite() {
  await rolleErzwingen(["admin", "dispo"]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Standorte importieren</h1>
        <p className="mt-1 text-sm text-ink-2">
          Eine Zeile je Standort. Abgeglichen wird über den Namen: bekannte werden aktualisiert,
          unbekannte neu angelegt. Eine Spalte <span className="zahl">Anzahl</span> legt die
          Container gleich mit an – ihre Nummern entstehen aus dem Kürzel des Standorts.
        </p>
        <p className="mt-2 text-sm text-ink-3">
          Sensoren, Status und Geschichte einzelner Container rührt der Import nicht an. Leere
          Zellen bedeuten „nicht angegeben“ und löschen nichts.
        </p>
      </div>

      <Importbereich />
    </div>
  );
}
