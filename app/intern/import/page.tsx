import { rolleErzwingen } from "@/lib/auth";
import { Importbereich } from "./Importbereich";

export const metadata = { title: "Import" };

export default async function ImportSeite() {
  await rolleErzwingen(["admin", "dispo"]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Container importieren</h1>
        <p className="mt-1 text-sm text-ink-2">
          Für den Export aus der DRK-Dienstleistungsdatenbank. Abgeglichen wird über die
          Containernummer: bekannte Nummern werden aktualisiert, unbekannte neu angelegt.
          Kalibrierung, Status und Sensorzuordnung bleiben unverändert.
        </p>
      </div>

      <Importbereich />
    </div>
  );
}
