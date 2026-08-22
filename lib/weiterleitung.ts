/**
 * Prüft ein Weiterleitungsziel aus der Adresszeile.
 *
 * `?weiter=` steht in der Anmeldeseite und im Rückweg der E-Mail-Links. Eine
 * bloße Prüfung auf einen führenden Schrägstrich genügt dafür nicht: der
 * Browser liest `//beispiel.invalid` als protokollrelative Adresse, und
 * `new URL("//beispiel.invalid", origin)` ergibt genau diesen fremden Host.
 * `/\beispiel.invalid` deuten Browser ebenso. Damit ließe sich ein Link auf die
 * echte Anmeldeseite verschicken, der nach dem Anmelden auf einer fremden Seite
 * endet - die klassische offene Weiterleitung.
 *
 * Zugelassen ist deshalb nur ein Pfad innerhalb dieser Anwendung.
 */
export function sicheresZiel(wert: string | null | undefined, standard = "/intern"): string {
  if (!wert) return standard;
  if (!wert.startsWith("/")) return standard;
  // "//host" und "/\host" verlassen die eigene Anwendung.
  if (wert.startsWith("//") || wert.startsWith("/\\")) return standard;
  // Steuerzeichen (u. a. Zeilenumbruch und Tabulator) können die Prüfung im
  // Browser aushebeln, weil er sie vor dem Auswerten entfernt.
  if (/[\u0000-\u0020\u007f]/.test(wert)) return standard;
  return wert;
}
