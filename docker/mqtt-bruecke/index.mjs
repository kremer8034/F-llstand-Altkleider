/**
 * Brücke MQTT → /api/ingest/webhook
 *
 * Der Milesight EM400 spricht kein HTTP (docs/em400-tld.md). Er veröffentlicht
 * auf dem Broker, und dieser Dienst holt die Meldung dort ab und reicht sie an
 * die Anwendung weiter. Mehr tut er nicht: er dekodiert nichts, er rechnet
 * nichts, er kennt keine Füllstände. Das alles steht in der Anwendung, an
 * einer Stelle, für beide Annahmewege gemeinsam.
 *
 * Warum ein eigener Dienst und nicht ein Stück der Anwendung: die Anwendung
 * ist eine Web-Anwendung. Sie antwortet auf Anfragen und hält keine dauerhafte
 * Verbindung offen - bei Vercel könnte sie es gar nicht. Eine MQTT-Verbindung
 * ist aber genau das: dauerhaft offen. Deshalb ein kleiner Dienst daneben, der
 * nichts weiter kann als warten und weiterreichen.
 *
 * Dadurch läuft die Brücke auch dann im eigenen Haus, wenn die Anwendung bei
 * Vercel liegt. Sie ruft nur hinaus und braucht selbst keinen offenen Port.
 */

import mqtt from "mqtt";

const BROKER = process.env.MQTT_BROKER ?? "mqtt://mosquitto:1883";
const BENUTZER = process.env.MQTT_BENUTZER ?? "bruecke";
const PASSWORT = process.env.MQTT_PASSWORT ?? "";
const THEMA = process.env.MQTT_THEMA ?? "altkleider/+/up";
const ZIEL = process.env.INGEST_URL ?? "http://gateway/api/ingest/webhook";
const SCHLUESSEL = process.env.INGEST_WEBHOOK_TOKEN ?? "";

/** Wie oft eine Zustellung wiederholt wird, bevor sie aufgegeben wird. */
const VERSUCHE = 3;
const WARTEN_MS = [2000, 8000];

function protokoll(...text) {
  console.log(new Date().toISOString(), ...text);
}

// Ohne Schlüssel weist der Annahmeweg jede Meldung ab (503). Das gleich beim
// Start zu sagen ist ehrlicher, als stündlich eine Fehlermeldung je Messung zu
// schreiben - und der Neustart des Containers ist ein deutlicheres Zeichen als
// eine Zeile im Protokoll, die niemand liest.
if (SCHLUESSEL.length < 16) {
  console.error(
    "INGEST_WEBHOOK_TOKEN fehlt oder ist zu kurz. Ohne ihn nimmt " +
      "/api/ingest/webhook nichts an. Erzeugen mit: openssl rand -hex 32",
  );
  process.exit(1);
}

/**
 * Die Nutzlast in ein Objekt bringen, das der Dekoder lesen kann.
 *
 * Der EM400 meldet ab Werk JSON. Steht das Gerät auf HEX, kommen rohe Bytes an;
 * die werden als Hexzeichenkette unter `payload` gereicht - genau dort sucht
 * der Dekoder die Bytefolge (lib/dekoder/milesight.ts).
 *
 * Kommt beides nicht in Frage, wird der Text unverändert mitgegeben. Er landet
 * dann in `messung.roh`, und die Antwort des Annahmewegs sagt, dass kein
 * Abstand darin war. Das ist die brauchbare Auskunft: Wegwerfen wäre eine
 * Meldung, die nie jemand zu Gesicht bekommt.
 */
function nutzlastLesen(rohbytes) {
  const text = rohbytes.toString("utf8").trim();

  if (text.startsWith("{")) {
    try {
      const gelesen = JSON.parse(text);
      if (gelesen && typeof gelesen === "object" && !Array.isArray(gelesen)) return gelesen;
    } catch {
      // faellt unten durch
    }
  }

  if (/^[0-9a-fA-F\s]+$/.test(text) && text.replace(/\s/g, "").length >= 4) {
    return { payload: text.replace(/\s/g, "") };
  }

  if (rohbytes.length > 0 && !text.startsWith("{")) {
    return { payload: rohbytes.toString("hex") };
  }

  return { unlesbar: text };
}

/** Aus `altkleider/<SN>/up` die Seriennummer holen. */
function seriennummerAusThema(thema) {
  const teile = thema.split("/").filter(Boolean);
  return teile.length >= 2 ? teile[1] : null;
}

async function weiterreichen(rumpf, thema) {
  for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
    try {
      const antwort = await fetch(ZIEL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ingest-Schluessel": SCHLUESSEL,
        },
        body: JSON.stringify(rumpf),
      });

      const text = await antwort.text();

      if (antwort.ok) {
        protokoll(`${thema} → ${antwort.status} ${text}`);
        return;
      }

      // 4xx heisst: an dieser Meldung ist etwas falsch. Ein zweiter Versuch
      // aendert daran nichts und verzoegert nur die naechste.
      if (antwort.status >= 400 && antwort.status < 500) {
        protokoll(`${thema} → ${antwort.status} ${text} - wird nicht wiederholt`);
        return;
      }

      protokoll(`${thema} → ${antwort.status} ${text} (Versuch ${versuch}/${VERSUCHE})`);
    } catch (fehler) {
      protokoll(`${thema} → ${String(fehler)} (Versuch ${versuch}/${VERSUCHE})`);
    }

    if (versuch < VERSUCHE) {
      await new Promise((weiter) => setTimeout(weiter, WARTEN_MS[versuch - 1] ?? 8000));
    }
  }

  // Aufgegeben. Verloren ist die Messung damit nicht: das Geraet sendet sie
  // erneut, wenn "Data Storage / Retransmission" eingeschaltet ist, und eine
  // doppelt eingereichte Messung ist kein Problem - die Datenbank hat einen
  // eindeutigen Index auf (sensor_id, gemessen_am) und verwirft die Dublette.
  protokoll(`${thema} → aufgegeben nach ${VERSUCHE} Versuchen`);
}

protokoll(`Brücke startet: ${BROKER}, Thema ${THEMA} → ${ZIEL}`);

const client = mqtt.connect(BROKER, {
  username: BENUTZER,
  password: PASSWORT,
  clientId: `bruecke-${Math.random().toString(16).slice(2, 10)}`,
  reconnectPeriod: 5000,
  clean: false,
});

client.on("connect", () => {
  protokoll("mit dem Broker verbunden");
  // QoS 1: der Broker wiederholt, bis die Bruecke bestaetigt. Zusammen mit
  // clean:false bleiben Meldungen liegen, waehrend die Bruecke neu startet.
  client.subscribe(THEMA, { qos: 1 }, (fehler) => {
    if (fehler) protokoll(`Thema ${THEMA} nicht abonniert: ${fehler.message}`);
    else protokoll(`Thema ${THEMA} abonniert`);
  });
});

client.on("message", (thema, rohbytes) => {
  const rumpf = nutzlastLesen(rohbytes);
  const ausThema = seriennummerAusThema(thema);

  // Nur als Rueckfalllinie: der EM400 nennt seine Seriennummer in der Meldung.
  // Taete er es nicht, waere die Meldung ohne diese Zeile keinem Geraet
  // zuzuordnen. Der Dekoder greift darauf zurueck, wenn die Nutzlast selbst
  // keine Kennung traegt (lib/dekoder/milesight.ts).
  if (ausThema) rumpf.sn_aus_topic = ausThema;

  void weiterreichen(rumpf, thema);
});

client.on("error", (fehler) => protokoll(`Broker-Fehler: ${fehler.message}`));
client.on("reconnect", () => protokoll("Verbindung zum Broker wird wiederhergestellt"));
client.on("close", () => protokoll("Verbindung zum Broker geschlossen"));

for (const zeichen of ["SIGTERM", "SIGINT"]) {
  process.on(zeichen, () => {
    protokoll(`${zeichen} - Brücke wird beendet`);
    client.end(false, {}, () => process.exit(0));
  });
}
