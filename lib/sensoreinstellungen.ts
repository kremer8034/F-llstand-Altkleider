/**
 * Was in der ToolBox-App eines Fertiggeraets eingetragen werden muss.
 *
 * Diese Werte standen bisher nur in docs/mqtt.md. Wer draussen am Container
 * steht, hat aber kein Repository dabei - und abschreiben laesst sich ein
 * 48-stelliges Passwort ohnehin nicht. Deshalb stellt die Oberflaeche sie
 * zusammen und zeigt sie an (app/intern/sensoren/Nfceinstellungen.tsx).
 *
 * Die Reihenfolge folgt bewusst der App: Application Mode, Broker Address,
 * Port, Client ID, User Credentials, TLS, Zertifikatsdateien. So laesst sich
 * die Liste von oben nach unten abarbeiten, ohne zu suchen.
 *
 * Nur auf dem Server verwenden: das Passwort steht in MQTT_SENSOR_PASSWORT,
 * bewusst ohne NEXT_PUBLIC_-Praefix, damit es in kein Browser-Bundle wandert.
 * Es wird ausschliesslich in Server Components an angemeldete Benutzer
 * ausgegeben.
 */

/** Wo die Wurzelzertifikate liegen - oeffentlich, sie stehen in jedem Browser. */
export const CA_DATEI = "/zertifikate/isrg-root.pem";

/**
 * Client-Zertifikat und -Schluessel der Sensoren. Anders als die Wurzeln oben
 * sind das Zugangsmittel: sie gehen nur ueber einen angemeldeten Abruf raus
 * (app/intern/sensoren/zertifikat/route.ts), niemals ueber public/.
 */
export const ZERTIFIKATSDATEIEN = {
  client: "sensor.pem",
  schluessel: "sensor-key.pem",
} as const;

export interface Nfceinstellung {
  /** Beschriftung, so wie sie in der ToolBox-App steht. */
  feld: string;
  wert: string;
  /** Erklaerung, falls der Wert allein nicht traegt. */
  hinweis?: string;
  /** Zum Antippen: Werte, die man nicht abschreiben will. */
  kopierbar?: boolean;
  /** Nicht ueber die Schulter zeigen. */
  geheim?: boolean;
  /** Statt eines Wertes eine Datei zum Herunterladen. */
  datei?: string;
}

export interface Sensoreinstellungen {
  einstellungen: Nfceinstellung[];
  /** Was fehlt, damit die Anzeige vollstaendig waere - sonst null. */
  fehlt: string | null;
}

/** Der Rechnername aus der oeffentlichen Adresse - ohne Schema und Pfad. */
function rechnername(): string {
  const roh = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    return new URL(roh).hostname;
  } catch {
    return roh.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

/**
 * Die Einstellungen fuer ein Geraet, das ueber MQTT meldet.
 *
 * `geraeteId` ist die Seriennummer - sie steckt im Thema und macht die
 * Meldungen zuordenbar, auch wenn die Nutzlast selbst keine Kennung traegt.
 */
export function nfceinstellungen(geraeteId: string, intervallMinuten: number): Sensoreinstellungen {
  const host = rechnername();
  const port = process.env.MQTT_PORT_TLS || "8883";
  const passwort = process.env.MQTT_SENSOR_PASSWORT || "";

  const fehlt = !host
    ? "Die öffentliche Adresse ist nicht eingerichtet (NEXT_PUBLIC_SITE_URL)."
    : !passwort
      ? "Für die Sensoren ist kein MQTT-Konto eingerichtet. In der .env MQTT_SENSOR_PASSWORT setzen und den Broker neu starten (docs/mqtt.md)."
      : null;

  return {
    fehlt,
    einstellungen: [
      { feld: "Application Mode", wert: "MQTT" },
      { feld: "Broker Address", wert: host, kopierbar: true },
      { feld: "Port", wert: port },
      {
        feld: "Client ID",
        wert: geraeteId,
        kopierbar: true,
        hinweis:
          "Die App füllt das Feld meist selbst mit der Seriennummer. Steht dort etwas anderes als hier, gilt das Gerät – dann gehört dieser Wert auch in die Geräteaufnahme.",
      },
      { feld: "User Credentials", wert: "ein" },
      { feld: "UserName", wert: "sensor", kopierbar: true },
      { feld: "Password", wert: passwort, kopierbar: true, geheim: true },
      { feld: "TLS", wert: "ein" },
      { feld: "TLS Version", wert: "TLS v1.2" },
      {
        feld: "CA File",
        wert: "isrg-root.pem",
        datei: CA_DATEI,
        hinweis:
          "Herunterladen und in der App auswählen. Damit prüft der Sensor, dass er wirklich mit diesem Server spricht.",
      },
      {
        feld: "Client Certificate",
        wert: "sensor.pem",
        datei: "/intern/sensoren/zertifikat?art=client",
        hinweis: "Der Ausweis des Geräts gegenüber dem Broker. Ohne ihn kommt es auf 8883 nicht herein.",
      },
      {
        feld: "Client Key",
        wert: "sensor-key.pem",
        datei: "/intern/sensoren/zertifikat?art=schluessel",
        hinweis: "Der zugehörige Schlüssel. Gehört ins Gerät und sonst nirgendwohin.",
      },
      {
        feld: "Uplink Topic",
        wert: `sensoren/${geraeteId}/up`,
        kopierbar: true,
        hinweis:
          "Nur falls die App ein Themenfeld anbietet. Bietet sie keines, ist das kein Hindernis – die Brücke hört auf allen Themen mit.",
      },
      {
        feld: "QoS",
        wert: "1",
        hinweis:
          "Falls einstellbar. Bei 0 sendet das Gerät einmal und vergisst; wer viermal am Tag sendet, kann nichts nachliefern.",
      },
      {
        feld: "Reporting Interval",
        wert: `${intervallMinuten} min`,
        hinweis:
          intervallMinuten === 360
            ? "vier Meldungen pro Tag · steht unter Device → General"
            : "steht unter Device → General",
      },
      {
        feld: "Cumulative Numbers",
        wert: "aus",
        hinweis:
          "Sammelt Messungen und sendet sie gebündelt – bei 12 käme erst nach dem Zwölffachen des Intervalls eine Meldung. Aus heißt: jede Messung geht sofort raus.",
      },
      {
        feld: "Data Storage / Retransmission",
        wert: "ein",
        hinweis: "Meldungen aus Funklöchern kommen später nach.",
      },
      {
        feld: "Nutzlastformat",
        wert: "JSON",
        hinweis: "Werkseinstellung. HEX wird ebenfalls gelesen – beides ist recht.",
      },
      {
        feld: "Calibration Value",
        wert: "0.000",
        hinweis:
          "Reiter Calibration. Den Versatz trägt die Anwendung ein (Montageversatz) – beides zu setzen rechnet ihn doppelt.",
      },
      {
        feld: "Threshold → Distance",
        wert: "aus",
        hinweis:
          "Die Schwellen stehen in der Anwendung, in Prozent und aus der Kalibrierung gerechnet. Das Gerät kennt nur Meter und weiß nichts vom Container – ein Wert hier ginge beim ersten Umbau still daneben.",
      },
      {
        feld: "Measure Outlier Calibration",
        wert: "ein",
        hinweis:
          "Weicht ein Wert stark vom vorigen ab, misst das Gerät noch einmal – es verwirft nichts. Über weichem, unebenem Stoff fängt das einzelne Fehlechos ab, ohne eine echte Leerung zu verschlucken.",
      },
    ],
  };
}
