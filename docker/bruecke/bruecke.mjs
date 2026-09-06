/**
 * Brücke zwischen MQTT-Broker und Anwendung.
 *
 * Der Broker nimmt die Meldungen der Sensoren entgegen, aber er tut nichts
 * damit - MQTT ist ein Briefkasten, kein Empfänger. Dieses Programm ist der
 * Empfänger: es abonniert die Themen der Geräte und reicht jede Meldung an
 * denselben Annahmeweg weiter, den auch die Herstellerwolke benutzt:
 *
 *   Gerät ──MQTT──▶ Broker ──[diese Brücke]──▶ POST /api/ingest/webhook
 *
 * Bewusst so herum: Dekoder, Gerätesuche, Leerungserkennung und Alarme
 * hängen am Annahmeweg, nicht am Übertragungsweg. Würde die Brücke selbst in
 * die Datenbank schreiben, gäbe es dieselbe Rechnung zweimal - und die
 * zweite Fassung wäre die, die niemand pflegt.
 *
 * Umgebung:
 *   MQTT_ADRESSE            mqtt://mqtt:1883 (Vorgabe)
 *   MQTT_BENUTZER/-PASSWORT Konto der Brücke, aus der .env
 *   MQTT_THEMA              abonniertes Thema, Vorgabe "#" (alle)
 *   INGEST_URL              Ziel, Vorgabe http://gateway:8081/api/ingest/webhook
 *   INGEST_WEBHOOK_TOKEN    Schlüssel für diesen Annahmeweg
 */

import mqtt from "mqtt";

const ADRESSE = process.env.MQTT_ADRESSE ?? "mqtt://mqtt:1883";
const BENUTZER = process.env.MQTT_BENUTZER ?? "";
const PASSWORT = process.env.MQTT_PASSWORT ?? "";
const THEMA = process.env.MQTT_THEMA ?? "#";
const ZIEL = process.env.INGEST_URL ?? "http://gateway:8081/api/ingest/webhook";
const SCHLUESSEL = process.env.INGEST_WEBHOOK_TOKEN ?? "";

if (!BENUTZER || !PASSWORT) {
  console.error("FEHLER: MQTT_BENUTZER und MQTT_PASSWORT fehlen.");
  process.exit(1);
}

if (SCHLUESSEL.length < 16) {
  console.error(
    "FEHLER: INGEST_WEBHOOK_TOKEN fehlt oder ist zu kurz. Ohne ihn nimmt der " +
      "Annahmeweg nichts an (er antwortet mit 503).",
  );
  process.exit(1);
}

function zeit() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Nutzlast lesen
// ---------------------------------------------------------------------------

/** Namen, unter denen eine Meldung ihr Gerät nennen kann - wie im Dekoder. */
const KENNUNGSNAMEN = new Set([
  "sn",
  "serial",
  "serialnumber",
  "devicesn",
  "deviceid",
  "devicename",
  "device",
  "imei",
  "iccid",
  "simiccid",
]);

function vereinfachen(name) {
  return name.toLowerCase().replace(/[_\-\s]/g, "");
}

/** Nennt diese Meldung irgendwo ihr Gerät? */
function hatKennung(objekt, tiefe = 0) {
  if (!objekt || typeof objekt !== "object" || tiefe > 1) return false;

  for (const [schluessel, wert] of Object.entries(objekt)) {
    if (wert === null || wert === undefined || wert === "") continue;
    if (typeof wert === "object") {
      if (!Array.isArray(wert) && hatKennung(wert, tiefe + 1)) return true;
      continue;
    }
    if (KENNUNGSNAMEN.has(vereinfachen(schluessel))) return true;
  }
  return false;
}

const NUR_HEX = /^[0-9a-fA-F]+$/;

/**
 * Aus dem, was über MQTT kam, einen JSON-Rumpf machen.
 *
 * Drei Formen kommen vor, je nach Einstellung in der NFC-App:
 *   a) JSON            - die Werkseinstellung der NB-IoT-Reihe
 *   b) HEX als Text    - dieselben Werte als Bytefolge, lesbar geschrieben
 *   c) rohe Bytes      - dieselbe Bytefolge, unverpackt
 *
 * (b) und (c) wandern als `payload` weiter; der Dekoder der Anwendung liest
 * das Milesight-Format Kanal/Typ/Wert daraus. Nichts wird hier gerechnet -
 * die Brücke soll den Wert nicht kennen, den sie weiterreicht.
 */
function rumpfBauen(nutzlast) {
  const text = nutzlast.toString("utf8").trim();

  if (text.startsWith("{")) {
    try {
      const gelesen = JSON.parse(text);
      if (gelesen && typeof gelesen === "object" && !Array.isArray(gelesen)) {
        return { rumpf: gelesen, form: "JSON" };
      }
    } catch {
      // Fällt unten auf die Bytefolge zurück.
    }
  }

  // Trennzeichen zuerst weg: manche Firmware schreibt "01 75 64" oder
  // "01:75:64". Ohne diesen Schritt fiele so eine Meldung durch die
  // Hex-Pruefung und wuerde unten als rohe Bytes noch einmal kodiert - aus
  // lesbarem Text wuerde Unsinn, den kein Dekoder mehr versteht.
  const ohneTrenner = text.replace(/^0x/i, "").replace(/[\s:-]/g, "");

  if (ohneTrenner.length > 0 && ohneTrenner.length % 2 === 0 && NUR_HEX.test(ohneTrenner)) {
    return { rumpf: { payload: ohneTrenner }, form: "HEX" };
  }

  return { rumpf: { payload: nutzlast.toString("hex") }, form: "Bytes" };
}

/**
 * Fehlt die Kennung in der Nutzlast, tritt das Thema an ihre Stelle:
 * "sensoren/<SN>/up" nennt das Gerät im zweiten Abschnitt.
 *
 * Nur als Rückfall, und nur bei genau diesem Zuschnitt. Ein Gerät, dessen
 * Firmware das Thema nicht einstellen lässt, sendet auf etwas Eigenem - da
 * den zweiten Abschnitt für eine Seriennummer zu halten, ergäbe eine
 * erfundene Kennung. Dann lieber keine: die Antwort des Annahmewegs nennt im
 * Feld "gesucht", was tatsächlich ankam, und genau das gehört in die
 * Geräteaufnahme.
 */
function kennungAusThema(thema) {
  const teile = thema.split("/").filter(Boolean);
  if (teile.length < 2 || teile[0] !== "sensoren") return null;
  return teile[1];
}

// ---------------------------------------------------------------------------
// Weiterreichen
// ---------------------------------------------------------------------------

/**
 * Gibt die Meldung an die Anwendung weiter.
 *
 * Rueckgabe: true, wenn die Sache abgeschlossen ist - dann darf die Meldung
 * beim Broker quittiert werden. false heisst "nochmal versuchen": die
 * Anwendung war nicht erreichbar oder hat sich verschluckt. Dann bleibt die
 * Meldung unquittiert und der Broker liefert sie beim naechsten Verbinden
 * erneut aus.
 *
 * Eine Ablehnung mit 4xx gilt als abgeschlossen: ein unbekanntes Geraet wird
 * durch Wiederholen nicht bekannter, und die Meldung endlos im Kreis zu
 * schicken hilft niemandem. Sie steht im Protokoll.
 */
async function weitergeben(thema, rumpf, form) {
  let antwort;
  try {
    antwort = await fetch(ZIEL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ingest-Schluessel": SCHLUESSEL,
      },
      body: JSON.stringify(rumpf),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (fehler) {
    console.error(`${zeit()} ${thema}: Anwendung nicht erreichbar - ${fehler.message}`);
    return false;
  }

  const inhalt = await antwort.text();

  if (antwort.status >= 500) {
    console.error(`${zeit()} ${thema}: Anwendung meldet ${antwort.status} - wird erneut versucht`);
    return false;
  }

  if (!antwort.ok) {
    // 404 nennt im Feld "gesucht" die Kennungen aus der Meldung. Genau die
    // gehören in die Geräteaufnahme - deshalb steht die Antwort vollständig
    // im Protokoll und wird nicht zu "Fehler" verkürzt.
    console.error(`${zeit()} ${thema}: abgelehnt (${antwort.status}) ${inhalt}`);
    return true;
  }

  console.log(`${zeit()} ${thema} [${form}]: ${inhalt}`);
  return true;
}

// ---------------------------------------------------------------------------
// Verbindung
// ---------------------------------------------------------------------------

const klient = mqtt.connect(ADRESSE, {
  username: BENUTZER,
  password: PASSWORT,
  // Fester Name, und das ist wesentlich: der Broker führt die gemerkte
  // Sitzung unter dem Client-Namen. Mit einem zufälligen Namen entstünde bei
  // jedem Neustart eine neue Sitzung - die aufgehobenen Meldungen der alten
  // blieben liegen, und der Broker sammelte verwaiste Sitzungen an.
  clientId: process.env.MQTT_CLIENT_ID ?? "fuellstand-bruecke",
  // Der Broker hebt Meldungen für eine gemerkte Sitzung auf. Genau das ist
  // hier erwünscht: läuft die Brücke kurz nicht, gehen die Meldungen der
  // Geräte nicht verloren, sondern kommen beim nächsten Verbinden nach.
  clean: false,
  // Bestätigt wird von Hand - siehe unten. Ohne das quittiert mqtt.js schon
  // beim Empfang, und eine Meldung wäre auch dann weg, wenn die Anwendung
  // sie gar nicht angenommen hat.
  manualAcks: true,
  reconnectPeriod: 5000,
});

klient.on("connect", () => {
  console.log(`${zeit()} Mit ${ADRESSE} verbunden.`);
  // QoS 1: der Broker wiederholt, bis die Brücke bestätigt hat. Ein Gerät,
  // das viermal am Tag sendet, kann keine Meldung nachliefern.
  klient.subscribe(THEMA, { qos: 1 }, (fehler) => {
    if (fehler) {
      console.error(`${zeit()} Thema "${THEMA}" nicht abonniert: ${fehler.message}`);
      return;
    }
    console.log(`${zeit()} Abonniert: ${THEMA} -> ${ZIEL}`);
  });
});

klient.on("message", (thema, nutzlast, paket) => {
  const { rumpf, form } = rumpfBauen(nutzlast);

  if (!hatKennung(rumpf)) {
    const ausThema = kennungAusThema(thema);
    if (ausThema) rumpf.sn = ausThema;
  }

  void weitergeben(thema, rumpf, form).then((fertig) => {
    // Erst quittieren, wenn die Anwendung die Meldung tatsächlich hat.
    if (fertig) klient.handleMessage(paket, () => {});
  });
});

klient.on("reconnect", () => console.log(`${zeit()} Verbindung wird neu aufgebaut …`));
klient.on("error", (fehler) => console.error(`${zeit()} MQTT-Fehler: ${fehler.message}`));
klient.on("close", () => console.log(`${zeit()} Verbindung geschlossen.`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`${zeit()} ${signal} - Brücke wird beendet.`);
    klient.end(false, {}, () => process.exit(0));
  });
}
