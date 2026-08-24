/**
 * Die geprueften Geraetebauarten an einer Stelle.
 *
 * Die Datenbank haelt `sensor.bauart` bewusst als freien Text und nicht als
 * Aufzaehlungstyp (Begruendung in 0009_geraetevielfalt.sql). Damit Oberflaeche,
 * Dekoder und Dokumentation trotzdem dasselbe meinen, steht die Liste hier -
 * und nur hier.
 *
 * Wer ein weiteres Geraet aufnimmt, ergaenzt einen Eintrag und, falls es eine
 * eigene Nutzlast spricht, einen Dekoder unter lib/dekoder/.
 */

/** Auf welchem Weg ein Geraet seine Messwerte loswird. */
export type Annahmeweg = "eigenbau" | "webhook";

export interface Geraeteart {
  /** Wert der Spalte sensor.bauart. */
  kennung: string;
  name: string;
  hersteller: string;
  messprinzip: string;
  /** Blindzone: naeher gemessene Werte sind nicht zu gebrauchen. */
  mess_min_mm: number;
  mess_max_mm: number;
  annahme: Annahmeweg;
  /**
   * Welches Feld das Geraet in seinen Meldungen als Kennung nennt. Danach
   * wird es beim Eintreffen einer Meldung gesucht.
   */
  kennung_in_meldung: "geraete_id" | "imei" | "iccid";
  /** Was beim Aufnehmen einzutragen ist - steht so in der Oberflaeche. */
  hinweis: string;
}

export const GERAETEARTEN: Geraeteart[] = [
  {
    kennung: "eigenbau",
    name: "Eigenbau (ESP32 + A02YYUW)",
    hersteller: "selbst gebaut",
    messprinzip: "Ultraschall",
    mess_min_mm: 30,
    mess_max_mm: 4500,
    annahme: "eigenbau",
    kennung_in_meldung: "geraete_id",
    hinweis:
      "Die Geräte-ID vergeben Sie selbst; sie gehört außen aufs Gehäuse. Der Geräteschlüssel wird nach dem Anlegen einmal angezeigt und gehört in die Firmware.",
  },
  {
    kennung: "milesight_em400_tld",
    name: "Milesight EM400-TLD (NB-IoT)",
    hersteller: "Milesight",
    messprinzip: "ToF-Laser",
    // Datenblatt: 50 mm bis 2 m. Der Messbereich lässt sich beim Aufnehmen
    // ändern – siehe die Warnung in docs/em400-tld.md, Abschnitt „Reichweite".
    mess_min_mm: 50,
    mess_max_mm: 2000,
    annahme: "webhook",
    kennung_in_meldung: "geraete_id",
    hinweis:
      "Als Geräte-ID die Seriennummer (SN) vom Aufkleber eintragen – unter dieser Nummer meldet sich das Gerät. IMEI und ICCID zusätzlich, dann wird es auch darüber gefunden. Kein Schlüssel, keine Firmware: eingestellt wird per NFC am Handy.",
  },
  {
    kennung: "milesight_em400_mud",
    name: "Milesight EM400-MUD (NB-IoT)",
    hersteller: "Milesight",
    messprinzip: "Ultraschall",
    mess_min_mm: 30,
    mess_max_mm: 4500,
    annahme: "webhook",
    kennung_in_meldung: "geraete_id",
    hinweis:
      "Wie der EM400-TLD, nur mit Ultraschall statt Laser: als Geräte-ID die Seriennummer (SN) eintragen.",
  },
  {
    kennung: "dragino_dds75",
    name: "Dragino DDS75-CB / -NB",
    hersteller: "Dragino",
    messprinzip: "Ultraschall",
    mess_min_mm: 280,
    mess_max_mm: 7500,
    annahme: "webhook",
    kennung_in_meldung: "imei",
    hinweis:
      "Der DDS75 nennt in jeder Meldung seine IMEI – die gehört ins IMEI-Feld. Eingestellt wird per Bluetooth-App oder USB-TTL.",
  },
];

export const STANDARD_BAUART = "eigenbau";

export function geraeteart(kennung: string | null | undefined): Geraeteart | null {
  if (!kennung) return null;
  return GERAETEARTEN.find((g) => g.kennung === kennung) ?? null;
}

/** Anzeigename einer Bauart - unbekannte Werte bleiben lesbar stehen. */
export function bauartText(kennung: string | null | undefined): string {
  if (!kennung) return "unbekannt";
  return geraeteart(kennung)?.name ?? kennung;
}

/** Meldet dieses Geraet über den zweiten Annahmeweg (/api/ingest/webhook)? */
export function istFertiggeraet(kennung: string | null | undefined): boolean {
  return geraeteart(kennung)?.annahme === "webhook";
}
