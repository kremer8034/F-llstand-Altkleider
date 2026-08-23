import { redirect } from "next/navigation";

/**
 * Die Containerliste ist keine eigene Seite mehr, sondern eine Ansicht der
 * Standortseite.
 *
 * Zwei gleichrangige Menüpunkte für dieselbe Sache waren die Ursache der
 * Verwirrung: „Container" zeigte Plätze an, „Standorte" auch, und in welcher
 * der beiden Listen etwas zu ändern war, musste man wissen. Geplant,
 * angefahren und geleert wird der Standort – also führt er.
 *
 * Die Umleitung bleibt bestehen, damit alte Lesezeichen und Verweise aus
 * älteren Seiten nicht ins Leere laufen.
 */
export default function ContainerSeite() {
  redirect("/intern/standorte?ansicht=container");
}
