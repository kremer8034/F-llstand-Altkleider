/**
 * Prueft den Milesight-Dekoder (lib/dekoder/milesight.ts) gegen die Formen,
 * in denen ein EM400-TLD tatsaechlich meldet.
 *
 *   node scripts/dekoder-pruefen.mjs
 *
 * Ohne Abhaengigkeiten und ohne Datenbank. Node ab Fassung 22.18 liest die
 * TypeScript-Datei unmittelbar - es braucht also keinen Uebersetzungslauf, um
 * den Dekoder zu pruefen.
 *
 * Der Dekoder ist die Stelle, an der ein Fehler am teuersten waere: er faellt
 * nicht auf. Ein falsch gelesener Abstand ergibt einen plausiblen Fuellstand,
 * und niemand merkt, dass das Fahrzeug zum falschen Container faehrt.
 */

import { ausBytefolge, ausMeldung, ausStatusrahmen } from "../lib/dekoder/milesight.ts";

let fehler = 0;
let geprueft = 0;

function pruefe(was, ist, soll) {
  geprueft++;
  const gleich = JSON.stringify(ist) === JSON.stringify(soll);
  if (!gleich) {
    fehler++;
    console.error(`FEHLER  ${was}\n        erwartet ${JSON.stringify(soll)}\n        bekommen ${JSON.stringify(ist)}`);
  } else {
    console.log(`ok      ${was}`);
  }
}

// ---------------------------------------------------------------------------
// a) Bytefolge im Milesight-Format Kanal/Typ/Wert
// ---------------------------------------------------------------------------

// 01 75 64          Batterie 100 %
// 03 82 2C 01       Abstand 0x012C = 300 mm (kleinstwertiges Byte zuerst)
// 04 67 DC 00       Temperatur 0x00DC = 220 -> 22,0 °C
// 05 00 00          Lage normal
const voll = ausBytefolge("017564" + "03822c01" + "0467dc00" + "050000");
pruefe("Bytefolge: Batterie", voll.batterie_prozent, 100);
pruefe("Bytefolge: Abstand in mm", voll.abstand_mm, 300);
pruefe("Bytefolge: Temperatur", voll.temperatur_c, 22);
pruefe("Bytefolge: Lage", voll.lage, "normal");

const schief = ausBytefolge("050001");
pruefe("Bytefolge: schiefe Lage", schief.lage, "tilt");

const minus = ausBytefolge("0467" + "9cff"); // 0xff9c = -100 -> -10,0 °C
pruefe("Bytefolge: Minusgrade", minus.temperatur_c, -10);

pruefe("Bytefolge: Trennzeichen und 0x stören nicht",
  ausBytefolge("0x01 75 5A").batterie_prozent, 90);
pruefe("Bytefolge: Unsinn ergibt null", ausBytefolge("zzz"), null);
pruefe("Bytefolge: ungerade Länge ergibt null", ausBytefolge("017"), null);
pruefe("Bytefolge: leer ergibt null", ausBytefolge(""), null);

// Abgeschnittene Meldung: der Abstand steht vollstaendig da, danach bricht es
// ab. Was gelesen wurde, gilt - der Rest wird nicht geraten.
const kurz = ausBytefolge("03822c01" + "0175");
pruefe("Bytefolge: abgeschnitten - Gelesenes gilt", kurz.abstand_mm, 300);
pruefe("Bytefolge: abgeschnitten - Rest bleibt leer", kurz.batterie_prozent, null);

// --- Die NB-Fassung belegt die Kanaele anders herum -------------------------
//
// EM400-TLD (LoRaWAN):  Abstand 03 82, Temperatur 04 67
// EM400-MUD (NB-IoT):   Temperatur 03 67, Abstand 04 82
//
// Ein Dekoder, der auf die Kanalnummer prueft, liest genau eine der beiden
// Reihen und bricht bei der anderen gleich nach der Batterie ab. Deshalb
// entscheidet der Typ, nicht der Kanal - und deshalb steht das hier.
// Beispiel woertlich aus dem NB-Handbuch, Abschnitt "Periodic Report".
const nb = ausBytefolge("017564" + "0367f800" + "04820101" + "050000");
pruefe("NB-Fassung: Batterie", nb.batterie_prozent, 100);
pruefe("NB-Fassung: Temperatur auf Kanal 03", nb.temperatur_c, 24.8);
pruefe("NB-Fassung: Abstand auf Kanal 04", nb.abstand_mm, 257);
pruefe("NB-Fassung: Lage", nb.lage, "normal");

// fffd meldet das Geraet, wenn es nichts im Messbereich sieht. Der Wert wird
// durchgereicht, nicht verschluckt: die Datenbank markiert die Messung anhand
// der Messgrenzen als ungueltig, und ein Lebenszeichen bleibt ein
// Lebenszeichen.
pruefe("NB-Fassung: ausserhalb des Messbereichs", ausBytefolge("0482fdff").abstand_mm, 65533);

// Der GNSS-Block ist neun Byte lang und interessiert hier nicht. Weil seine
// Laenge bekannt ist, laesst er sich ueberspringen, ohne den Lesezeiger zu
// verlieren - was dahinter steht, wird noch gelesen.
const mitGnss = ausBytefolge("017564" + "0688" + "73c177019cff080722" + "04820101");
pruefe("GNSS wird uebersprungen - Abstand dahinter gilt", mitGnss.abstand_mm, 257);
pruefe("GNSS wird uebersprungen - Batterie davor gilt", mitGnss.batterie_prozent, 100);

// ---------------------------------------------------------------------------
// b) JSON, wie es die NB-IoT-Reihe schickt
// ---------------------------------------------------------------------------

const flach = ausMeldung({
  sn: "6746D3486383",
  imei: "867997030000001",
  battery: 96,
  distance: 812,
  temperature: 14.2,
  position: "normal",
  timestamp: 1755777600,   // 21.08.2025, 12:00 Uhr UTC
});
pruefe("JSON flach: Abstand", flach.abstand_mm, 812);
pruefe("JSON flach: Batterie", flach.batterie_prozent, 96);
pruefe("JSON flach: Temperatur", flach.temperatur_c, 14.2);
pruefe("JSON flach: Seriennummer", flach.kennung.geraete_id, "6746D3486383");
pruefe("JSON flach: IMEI", flach.kennung.imei, "867997030000001");
pruefe("JSON flach: Zeitpunkt", flach.gemessen_am, "2025-08-21T12:00:00.000Z");

const verschachtelt = ausMeldung({
  sn: "6746D3486383",
  iccid: "89882280000000000",
  data: { battery_level: 88, distance: 1234, temperature: -3.5, tilt_status: "tilt" },
});
pruefe("JSON verschachtelt: Abstand unter data", verschachtelt.abstand_mm, 1234);
pruefe("JSON verschachtelt: batteryLevel-Schreibweise", verschachtelt.batterie_prozent, 88);
pruefe("JSON verschachtelt: Minusgrade", verschachtelt.temperatur_c, -3.5);
pruefe("JSON verschachtelt: Lage", verschachtelt.lage, "tilt");
pruefe("JSON verschachtelt: ICCID", verschachtelt.kennung.iccid, "89882280000000000");

// Weiterleitung durch die Herstellerwolke: die Werte stecken nur in der
// Bytefolge. Der Dekoder muss sie von dort holen.
const ueberWolke = ausMeldung({
  deviceName: "ALT-EM400-1",
  payload: "017564038262010467dc00050000",
});
pruefe("Wolke: Abstand aus der Bytefolge", ueberWolke.abstand_mm, 354);
pruefe("Wolke: Batterie aus der Bytefolge", ueberWolke.batterie_prozent, 100);
pruefe("Wolke: Gerätename als Kennung", ueberWolke.kennung.geraete_id, "ALT-EM400-1");

// JSON hat Vorrang vor der Bytefolge - der Dekoder soll nicht zweimal dasselbe
// Feld unterschiedlich lesen.
const beides = ausMeldung({ sn: "X", distance: 999, payload: "03822c01" });
pruefe("JSON schlägt Bytefolge", beides.abstand_mm, 999);

// Zentimeter kommen vor - dann wird umgerechnet, nicht uebernommen.
pruefe("Zentimeter werden zu Millimetern",
  ausMeldung({ sn: "X", distance_cm: 81.2 }).abstand_mm, 812);

// Eine Meldung ohne Messwert ist keine Messung. Der Annahmeweg lehnt sie ab -
// hier zaehlt nur, dass der Dekoder das ehrlich meldet statt eine Null zu
// erfinden: eine Null waere ein voller Container.
const ohne = ausMeldung({ sn: "X", battery: 100 });
pruefe("Ohne Abstand kommt null, nicht 0", ohne.abstand_mm, null);

// ---------------------------------------------------------------------------
// c) Der Statusrahmen der NB-IoT-Reihe
// ---------------------------------------------------------------------------

// Wortwoertlich mitgeschnitten am 06.09.2026, 21:13 UTC, auf dem Thema
// em/6749F17756790021/status - also genau das, was ein EM400-MUD-N03GL ueber
// MQTT schickt, wenn man ihm nichts anderes beibringen kann (die NFC-App
// bietet weder ein Themenfeld noch eine Formatwahl).
//
// Die vier Kennungen sind Feld fuer Feld gegen die Basisinformationen
// desselben Geraets geprueft - sie sind nicht aus dem Rahmen geraten.
const RAHMEN =
  "020001005F0000000130313036303131303637343946313737353637393030323138363638" +
  "3430303738383334343439393031343035313830303038363035383938383232383036363" +
  "6383030303836303534" + "0C000E" + "017564" + "0367EE00" + "0482AD04" + "050001";

const rahmen = ausStatusrahmen(RAHMEN);
pruefe("Statusrahmen wird erkannt", rahmen !== null, true);
pruefe("Seriennummer aus dem Rahmen", rahmen?.kennung.geraete_id, "6749F17756790021");
pruefe("IMEI aus dem Rahmen", rahmen?.kennung.imei, "866840078834449");
pruefe("ICCID aus dem Rahmen", rahmen?.kennung.iccid, "89882280666800086054");
pruefe("Abstand aus dem Rahmen", rahmen?.werte.abstand_mm, 1197);
pruefe("Batterie aus dem Rahmen", rahmen?.werte.batterie_prozent, 100);
pruefe("Temperatur aus dem Rahmen", rahmen?.werte.temperatur_c, 23.8);
// Das Geraet meldet hier 05 00 01, also "schief" - es lag beim Mitschnitt
// auf dem Tisch statt im Container. Im Handbuchbeispiel steht 05 00 00.
// Erwartet wird also, was das Geraet WIRKLICH gesagt hat, nicht was schoener
// waere: eine Zusicherung, die den Mitschnitt zurechtbiegt, prueft nichts.
pruefe("Lage aus dem Rahmen", rahmen?.werte.lage, "tilt");

// Der Weg, den die Bruecke tatsaechlich nimmt: Nutzlast als payload, keine
// Kennung im Rumpf. Frueher kam hier "Geraet unbekannt" zurueck.
const ueberBruecke = ausMeldung({ payload: RAHMEN });
pruefe("Über die Brücke: Abstand", ueberBruecke.abstand_mm, 1197);
pruefe("Über die Brücke: Seriennummer", ueberBruecke.kennung.geraete_id, "6749F17756790021");

// Der Rahmen darf ausBytefolge nicht in die Haende fallen: die liest `02 00`
// als Lage und bricht bei Byte 3 ab - ein Ergebnis, aber ein falsches.
// Deshalb muss ausMeldung den Rahmen zuerst pruefen.
pruefe("Ohne Rahmenerkennung läse ausBytefolge Unsinn",
  ausBytefolge(RAHMEN)?.abstand_mm ?? null, null);

// Eine gewoehnliche Kanalfolge ist kein Statusrahmen - sie darf nicht
// versehentlich als einer gelesen werden.
pruefe("Kanalfolge ist kein Statusrahmen",
  ausStatusrahmen("017564" + "03822c01" + "0467dc00" + "050000"), null);

// ---------------------------------------------------------------------------
console.log("");
if (fehler > 0) {
  console.error(`${fehler} von ${geprueft} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Alle ${geprueft} Prüfungen bestanden.`);
