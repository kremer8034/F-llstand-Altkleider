/**
 * Adresse der Supabase-Schnittstelle.
 *
 * Im Docker-Betrieb laeuft alles hinter einem gemeinsamen Torwaechter: der
 * Browser spricht die oeffentliche Adresse an (z. B. http://localhost:8080),
 * die Anwendung im Container erreicht denselben Dienst aber nur ueber den
 * internen Netzwerknamen. SUPABASE_INTERNAL_URL deckt genau diesen Fall ab.
 *
 * Bei Supabase Cloud ist die Variable nicht gesetzt - dann gilt schlicht die
 * oeffentliche Adresse.
 */
export function supabaseAdresseServer(): string {
  const adresse = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!adresse) {
    throw new Error("Weder SUPABASE_INTERNAL_URL noch NEXT_PUBLIC_SUPABASE_URL ist gesetzt.");
  }
  return adresse;
}
