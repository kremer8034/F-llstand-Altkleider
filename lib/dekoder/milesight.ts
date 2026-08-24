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
 * Die vier Werte, die ein EM400 im HEX-Betrieb sendet:
 *
 *   01 75 <1>    Batterie in Prozent
 *   03 82 <2>    Abstand in mm, kleinstwertiges Byte zuerst
 *   04 67 <2>    Temperatur in Zehntelgrad, vorzeichenbehaftet
 *   05 00 <1>    Lage: 0 = normal, sonst schief
 *
 * Daneben gibt es Kanaele fuer Alarme und nachgereichte Verlaufssaetze. Die
 * tragen dieselben Messwerte mit einem zusaetzlichen Byte davor oder dahinter;
 * sie werden hier uebersprungen statt geraten - ein falsch ausgerichteter
 * Lesezeiger machte aus dem Rest der Bytefolge Unsinn, und Unsinn mit
 * plausiblen Zahlen ist schlimmer als eine Luecke.
 */
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
    i += 2;

    if (kanal === 0x01 && typ === 0x75 && i + 1 <= bytes.length) {
      werte.batterie_prozent = bytes[i];
      i += 1;
      etwasGefunden = true;
    } else if (kanal === 0x03 && typ === 0x82 && i + 2 <= bytes.length) {
      werte.abstand_mm = bytes.readUInt16LE(i);
      i += 2;
      etwasGefunden = true;
    } else if (kanal === 0x04 && typ === 0x67 && i + 2 <= bytes.length) {
      werte.temperatur_c = bytes.readInt16LE(i) / 10;
      i += 2;
      etwasGefunden = true;
    } else if (kanal === 0x05 && typ === 0x00 && i + 1 <= bytes.length) {
      werte.lage = bytes[i] === 0 ? "normal" : "tilt";
      i += 1;
      etwasGefunden = true;
    } else {
      // Unbekannter Kanal: hier bricht das Lesen ab. Was bis hierher
      // erkannt wurde, gilt; der Rest steht unveraendert in messung.roh.
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
