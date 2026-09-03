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

import { ausBytefolge, ausMeldung } from "../lib/dekoder/milesight.ts";

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
// c) Rueckfall auf die Seriennummer aus dem MQTT-Thema
//
// Die Bruecke traegt sie unter sn_aus_topic ein. Sie darf die Kennung aus der
// Nutzlast NICHT ueberstimmen - sonst schickte ein Tippfehler im Thema die
// Messung stillschweigend an den falschen Container.
// ---------------------------------------------------------------------------

const nurThema = ausMeldung({ sn_aus_topic: "6746D3486383", distance: 500 });
pruefe("Thema: greift, wenn die Nutzlast keine Kennung hat",
  nurThema.kennung.geraete_id, "6746D3486383");
pruefe("Thema: die Messwerte bleiben unberührt", nurThema.abstand_mm, 500);

const themaUndSn = ausMeldung({ sn: "AUS-NUTZLAST", sn_aus_topic: "AUS-THEMA", distance: 500 });
pruefe("Thema: die Nutzlast hat Vorrang",
  themaUndSn.kennung.geraete_id, "AUS-NUTZLAST");

const themaUndImei = ausMeldung({ imei: "867997030000001", sn_aus_topic: "AUS-THEMA" });
pruefe("Thema: auch eine IMEI in der Nutzlast hat Vorrang",
  themaUndImei.kennung.geraete_id, null);
pruefe("Thema: die IMEI bleibt die Kennung",
  themaUndImei.kennung.imei, "867997030000001");

// ---------------------------------------------------------------------------
// d) Weiterleitung eines gemieteten Brokers
//
// Die uebliche Vorlage lautet
//   { "topic": "...", "payload": ..., "clientid": "...", "qos": 1 }
// Die Nutzlast steckt darin je nach Einstellung als Objekt ODER als
// Zeichenkette - beides muss ankommen.
// ---------------------------------------------------------------------------

const brokerObjekt = ausMeldung({
  topic: "altkleider/6746D3486383/up",
  clientid: "6746D3486383",
  qos: 1,
  payload: { sn: "6746D3486383", battery: 96, distance: 812 },
});
pruefe("Broker: Nutzlast als Objekt", brokerObjekt.abstand_mm, 812);
pruefe("Broker: Kennung aus der Nutzlast", brokerObjekt.kennung.geraete_id, "6746D3486383");

const brokerText = ausMeldung({
  topic: "altkleider/6746D3486383/up",
  clientid: "6746D3486383",
  payload: '{"battery":88,"distance":1234}',
});
pruefe("Broker: Nutzlast als JSON-Zeichenkette", brokerText.abstand_mm, 1234);
pruefe("Broker: Batterie aus der Zeichenkette", brokerText.batterie_prozent, 88);
pruefe("Broker: Seriennummer aus dem vollen Thema",
  brokerText.kennung.geraete_id, "6746D3486383");

const brokerHex = ausMeldung({
  topic: "altkleider/6746D3486383/up",
  payload: "017564038262010467dc00050000",
});
pruefe("Broker: Nutzlast als Bytefolge", brokerHex.abstand_mm, 354);
pruefe("Broker: Thema trägt die Kennung", brokerHex.kennung.geraete_id, "6746D3486383");

const nurClientId = ausMeldung({ clientid: "6746D3486383", payload: '{"distance":700}' });
pruefe("Broker: Client-ID als letzte Rückfalllinie",
  nurClientId.kennung.geraete_id, "6746D3486383");

// Das Geraet hat immer Vorrang vor dem Umschlag des Brokers.
const streit = ausMeldung({
  topic: "altkleider/FALSCH/up",
  clientid: "AUCH-FALSCH",
  payload: { sn: "RICHTIG-AUS-NUTZLAST", distance: 700 },
});
pruefe("Broker: die Nutzlast schlägt Thema und Client-ID",
  streit.kennung.geraete_id, "RICHTIG-AUS-NUTZLAST");

// Ein Thema ohne Schraegstrich ist bereits die Seriennummer - so kommt
// dieselbe Funktion mit dem Feld der eigenen Bruecke zurecht.
pruefe("Broker: Thema ohne Schrägstrich gilt als Seriennummer",
  ausMeldung({ topic: "6746D3486383", payload: '{"distance":1}' }).kennung.geraete_id,
  "6746D3486383");

// ---------------------------------------------------------------------------
console.log("");
if (fehler > 0) {
  console.error(`${fehler} von ${geprueft} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
console.log(`Alle ${geprueft} Prüfungen bestanden.`);
