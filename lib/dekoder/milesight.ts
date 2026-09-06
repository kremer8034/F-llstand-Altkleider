/**
 * Dekoder fuer Milesight EM400-TLD und EM400-MUD in der NB-IoT-Ausfuehrung.
 *
 * Diese Geraete koennen unser Signaturverfahren nicht (docs/em400-tld.md).
 * Sie schicken ihre Werte an eine feste Adresse - entweder unmittelbar
 * (MQTT/TCP/UDP) oder ueber die Herstellerwolke, die sie weiterreicht. Hier
 * wird aus dieser Nutzlast eine Meldung, wie sie der Rest des Systems kennt.
 *
 * Zwei Formen sind vorgesehen, weil das Geraet beide beherrscht und die
 * Einstellung dazu in der NFC-App steht:
 *
 *   a) JSON  - die Werkseinstellung der NB-IoT-Reihe
 *   b) HEX   - dieselben Werte als Bytefolge, im Milesight-Format
 *              Kanal/Typ/Wert (aus der LoRaWAN-Welt uebernommen)
 *
 * Bei (a) sind die genauen Feldnamen zwischen Firmwarestaenden nicht
 * einheitlich, und ein Feld, das anders heisst als erwartet, waere ein
 * stillschweigend verlorener Messwert. Deshalb wird nicht auf einen festen
 * Namen geprueft, sondern auf eine Liste bekannter Schreibweisen - und der
 * unveraenderte Rumpf wandert ohnehin nach `messung.roh`, so dass sich
 * nachtraeglich nachsehen laesst, was tatsaechlich ankam.
 *
 * Einheiten, wie der EM400 sie meldet:
 *   Abstand      Millimeter (nicht Zentimeter)
 *   Batterie     Prozent (nicht Volt - siehe 0020_fertiggeraete.sql)
 *   Temperatur   Grad Celsius, in der Bytefolge als Zehntelgrad
 *   Lage         "normal" oder "tilt" - liegt das Geraet schief?
 */

export interface MilesightWerte {
  abstand_mm: number | null;
  batterie_prozent: number | null;
  temperatur_c: number | null;
  rssi: number | null;
  /** "normal" | "tilt" - alles andere bleibt stehen, wie es kam. */
  lage: string | null;
  /** Zeitpunkt der Messung, falls das Geraet einen mitschickt. */
  gemessen_am: string | null;
}

export interface MilesightMeldung extends MilesightWerte {
  /** Woran sich das Geraet erkennen laesst - in dieser Reihenfolge gesucht. */
  kennung: {
    geraete_id: string | null;
    imei: string | null;
    iccid: string | null;
  };
}

const LEERE_WERTE: MilesightWerte = {
  abstand_mm: null,
  batterie_prozent: null,
  temperatur_c: null,
  rssi: null,
  lage: null,
  gemessen_am: null,
};

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function zahl(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const n = typeof wert === "number" ? wert : Number(String(wert).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function zeichenkette(wert: unknown): string | null {
  if (typeof wert === "string") {
    const getrimmt = wert.trim();
    return getrimmt === "" ? null : getrimmt;
  }
  if (typeof wert === "number" && Number.isFinite(wert)) return String(wert);
  return null;
}

/**
 * Ein Feld unter mehreren moeglichen Namen suchen - erst im Objekt selbst,
 * dann in den ueblichen Verschachtelungen.
 *
 * Der Vergleich laeuft ueber kleingeschriebene Namen ohne Unterstriche, damit
 * `batteryLevel`, `battery_level` und `BatteryLevel` derselbe Name sind.
 */
function feldSuchen(objekt: Record<string, unknown>, namen: string[]): unknown {
  const gesucht = new Set(namen.map(vereinfachen));

  for (const [schluessel, wert] of Object.entries(objekt)) {
    if (wert === null || wert === undefined) continue;
    if (typeof wert === "object") continue;
    if (gesucht.has(vereinfachen(schluessel))) return wert;
  }
  return undefined;
}

function vereinfachen(name: string): string {
  return name.toLowerCase().replace(/[_\-\s]/g, "");
}

/**
 * Die Ebenen, auf denen Werte stehen koennen: das Objekt selbst und die
 * ueblichen Behaelter darin. Tiefer wird nicht gesucht - eine unbegrenzte
 * Suche fände irgendwann auch Felder, die etwas anderes bedeuten.
 */
function ebenen(rumpf: Record<string, unknown>): Record<string, unknown>[] {
  const gefunden: Record<string, unknown>[] = [rumpf];

  for (const name of ["data", "payload", "object", "decoded", "values", "body", "properties"]) {
    const wert = rumpf[name];
    if (wert && typeof wert === "object" && !Array.isArray(wert)) {
      gefunden.push(wert as Record<string, unknown>);
    }
  }
  return gefunden;
}

function ausEbenen(rumpf: Record<string, unknown>, namen: string[]): unknown {
  for (const ebene of ebenen(rumpf)) {
    const wert = feldSuchen(ebene, namen);
    if (wert !== undefined) return wert;
  }
  return undefined;
}

/** Unixzeit (Sekunden oder Millisekunden) oder ISO-Text zu ISO-Text. */
function zeitpunkt(wert: unknown): string | null {
  if (wert === null || wert === undefined) return null;

  const n = zahl(wert);
  if (n !== null && n > 1_000_000_000) {
    // Vor 2001 kann keine Messung liegen; ueber dieser Grenze sind es
    // Millisekunden. Beides kommt vor, je nach Firmwarestand.
    const ms = n > 100_000_000_000 ? n : n * 1000;
    const datum = new Date(ms);
    return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
  }

  const text = zeichenkette(wert);
  if (!text) return null;
  const datum = new Date(text);
  return Number.isNaN(datum.getTime()) ? null : datum.toISOString();
}

// ---------------------------------------------------------------------------
// a) Bytefolge im Milesight-Format Kanal/Typ/Wert
// ---------------------------------------------------------------------------

/**
 * Bytefolge im Milesight-Format Kanal/Typ/Wert.
 *
 * Gelesen wird nach dem **Typ**, nicht nach dem Kanal - und das ist der
 * Unterschied zur ersten Fassung, die hier falsch lag:
 *
 *   EM400-TLD (LoRaWAN)   Abstand 03 82, Temperatur 04 67
 *   EM400-MUD (NB-IoT)    Temperatur 03 67, Abstand 04 82
 *
 * Die Kanalnummern sind also zwischen den Bauarten vertauscht. Wer auf sie
 * prueft, liest genau eine der beiden Reihen und bricht bei der anderen
 * gleich nach der Batterie ab. Beispiel aus dem NB-Handbuch, Abschnitt
 * "Periodic Report":
 *
 *   01 75 64   03 67 f8 00   04 82 01 01   05 00 00
 *   Batterie   Temperatur    Abstand       Lage
 *   100 %      24,8 °C       257 mm        normal
 *
 * Der Typ traegt dagegen beides: Bedeutung UND Laenge. Damit bleibt der
 * Lesezeiger auch dann ausgerichtet, wenn ein Feld nicht interessiert - und
 * Alarmrahmen (dieselben Typen auf anderen Kanaelen) werden nebenbei mit
 * gelesen, statt das Lesen abzubrechen.
 *
 * Typen, die vorkommen:
 *
 *   75  1 Byte   Batterie in Prozent
 *   67  2 Byte   Temperatur in Zehntelgrad, vorzeichenbehaftet
 *   82  2 Byte   Abstand in mm (fffd = ausserhalb des Messbereichs)
 *   00  1 Byte   Lage: 0 = normal, sonst schief
 *   88  9 Byte   Standort per GNSS - wird uebersprungen, nicht gebraucht
 */

/** Wie viele Bytes hinter einem Typ stehen. */
const TYPLAENGE: Record<number, number> = {
  0x75: 1,
  0x67: 2,
  0x82: 2,
  0x00: 1,
  0x88: 9,
};

export function ausBytefolge(hex: string): MilesightWerte | null {
  const sauber = hex.trim().replace(/^0x/i, "").replace(/[\s:-]/g, "");
  if (sauber.length === 0 || sauber.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(sauber)) return null;

  const bytes = Buffer.from(sauber, "hex");
  const werte: MilesightWerte = { ...LEERE_WERTE };
  let i = 0;
  let etwasGefunden = false;

  while (i + 2 <= bytes.length) {
    const kanal = bytes[i];
    const typ = bytes[i + 1];
    const laenge = TYPLAENGE[typ];

    // Unbekannter Typ: hier bricht das Lesen ab. Ohne seine Laenge waere
    // jeder weitere Schritt geraten, und Unsinn mit plausiblen Zahlen ist
    // schlimmer als eine Luecke. Was bis hierher erkannt wurde, gilt; der
    // Rest steht unveraendert in messung.roh.
    if (laenge === undefined || i + 2 + laenge > bytes.length) break;

    const wert = i + 2;
    i = wert + laenge;

    switch (typ) {
      case 0x75:
        werte.batterie_prozent = bytes[wert];
        etwasGefunden = true;
        break;
      case 0x67:
        werte.temperatur_c = bytes.readInt16LE(wert) / 10;
        etwasGefunden = true;
        break;
      case 0x82:
        // fffd meldet das Geraet, wenn es nichts im Messbereich sieht. Der
        // Wert bleibt stehen: die Datenbank erkennt ihn an den Messgrenzen
        // der Bauart und markiert die Messung als ungueltig. Ihn hier zu
        // verschlucken hiesse, ein Lebenszeichen zu verlieren - und ein
        // stiller Sensor sieht aus wie ein defekter.
        werte.abstand_mm = bytes.readUInt16LE(wert);
        etwasGefunden = true;
        break;
      case 0x00:
        // Typ 00 ist allgemein; als Lage gilt er nur auf Kanal 05.
        if (kanal === 0x05) {
          werte.lage = bytes[wert] === 0 ? "normal" : "tilt";
          etwasGefunden = true;
        }
        break;
      default:
        // Bekannte Laenge, aber nichts, was hier gebraucht wird (GNSS).
        break;
    }
  }

  return etwasGefunden ? werte : null;
}

// ---------------------------------------------------------------------------
// b) JSON, wie es die NB-IoT-Reihe ab Werk schickt
// ---------------------------------------------------------------------------

const NAMEN = {
  abstand: ["distance", "distancemm", "abstand", "abstandmm", "level", "distanceValue"],
  abstandCm: ["distancecm"],
  batterie: ["battery", "batterylevel", "batterypercent", "bat", "soc"],
  temperatur: ["temperature", "temperaturec", "temp"],
  rssi: ["rssi", "signal", "signalstrength", "csq"],
  lage: ["position", "tilt", "tiltstatus", "lage"],
  zeit: ["timestamp", "ts", "time", "reporttime", "gemessenam", "datetime"],
  nutzlast: ["payload", "data", "raw", "hex", "rawdata", "payloadhex"],
  seriennummer: ["sn", "serial", "serialnumber", "devicesn", "deviceid", "devicename", "device"],
  imei: ["imei"],
  iccid: ["iccid", "simiccid"],
};

/**
 * Nutzlast eines Milesight-Geraets lesen.
 *
 * `rumpf` ist der geparste Rumpf der Meldung. Steckt darin ein Feld mit einer
 * Bytefolge (HEX-Betrieb oder Weiterleitung durch die Herstellerwolke), wird
 * diese zusaetzlich ausgewertet: die JSON-Felder haben Vorrang, die Bytefolge
 * fuellt, was dort fehlt.
 */
export function ausMeldung(rumpf: Record<string, unknown>): MilesightMeldung {
  const werte: MilesightWerte = { ...LEERE_WERTE };

  werte.abstand_mm = zahl(ausEbenen(rumpf, NAMEN.abstand));
  if (werte.abstand_mm === null) {
    const cm = zahl(ausEbenen(rumpf, NAMEN.abstandCm));
    if (cm !== null) werte.abstand_mm = Math.round(cm * 10);
  }
  werte.batterie_prozent = zahl(ausEbenen(rumpf, NAMEN.batterie));
  werte.temperatur_c = zahl(ausEbenen(rumpf, NAMEN.temperatur));
  werte.rssi = zahl(ausEbenen(rumpf, NAMEN.rssi));
  werte.lage = zeichenkette(ausEbenen(rumpf, NAMEN.lage));
  werte.gemessen_am = zeitpunkt(ausEbenen(rumpf, NAMEN.zeit));

  // Bytefolge nachschieben, wo JSON nichts hergab.
  const roh = zeichenkette(ausEbenen(rumpf, NAMEN.nutzlast));
  if (roh) {
    const ausHex = ausBytefolge(roh);
    if (ausHex) {
      werte.abstand_mm ??= ausHex.abstand_mm;
      werte.batterie_prozent ??= ausHex.batterie_prozent;
      werte.temperatur_c ??= ausHex.temperatur_c;
      werte.lage ??= ausHex.lage;
    }
  }

  return {
    ...werte,
    kennung: {
      geraete_id: zeichenkette(ausEbenen(rumpf, NAMEN.seriennummer)),
      imei: zeichenkette(ausEbenen(rumpf, NAMEN.imei)),
      iccid: zeichenkette(ausEbenen(rumpf, NAMEN.iccid)),
    },
  };
}
