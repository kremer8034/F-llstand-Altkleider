/**
 * Fuellstandsensor fuer Altkleidercontainer
 * ----------------------------------------
 * ESP32-S3 + SIM7080G (Cat-M / NB-IoT) + Ultraschallsensor A02YYUW.
 *
 * Ablauf bei jedem Aufwachen:
 *   1. Ultraschallsensor einschalten, mehrfach messen, Median bilden
 *   2. Modem hochfahren, ins Netz einbuchen, Uhrzeit holen
 *   3. Messung signieren (HMAC-SHA256) und per HTTPS an /api/ingest senden
 *   4. Ungesendete Messungen aus dem Puffer nachreichen
 *   5. Modem abschalten und bis zum naechsten Termin tief schlafen
 *
 * Aufgeweckt wird per Zeitgeber oder durch den Taster am Gehaeuse. Der Taster
 * loest eine Sofortmessung mit Anlass "taster" aus - genau das braucht das
 * Backend beim Anlernen und Kalibrieren.
 */

#include <Arduino.h>
#include <Preferences.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>
#include <mbedtls/md.h>
#include <time.h>

#define TINY_GSM_MODEM_SIM7080
#include <ArduinoHttpClient.h>
#include <TinyGsmClient.h>

#include "konfiguration.h"
#include "geheimnisse.h"

// ---------------------------------------------------------------------------
// Zustand, der den Tiefschlaf ueberdauert
// ---------------------------------------------------------------------------
struct Gepuffert {
  uint32_t zeit;         // Unixzeit der Messung
  int16_t  abstand_mm;
  uint16_t batterie_mv;
  int16_t  rssi;
  int16_t  temperatur_zehntel;
  uint8_t  anlass;       // 0 = intervall, 1 = taster, 2 = neustart
};

RTC_DATA_ATTR static uint32_t  rtcBootzaehler   = 0;
RTC_DATA_ATTR static uint16_t  rtcIntervall     = STANDARD_INTERVALL_MINUTEN;
RTC_DATA_ATTR static uint8_t   rtcPufferAnzahl  = 0;
RTC_DATA_ATTR static Gepuffert rtcPuffer[PUFFER_GROESSE];

static const char* ANLASS_TEXT[] = {"intervall", "taster", "neustart"};

HardwareSerial modemSeriell(1);
HardwareSerial sensorSeriell(2);
TinyGsm        modem(modemSeriell);

static Preferences speicher;
static String      geraeteSchluessel;  // 64 Hex-Zeichen

// ---------------------------------------------------------------------------
// Kleine Helfer
// ---------------------------------------------------------------------------
static void ledBlinken(uint8_t anzahl, uint16_t dauer = 120) {
  for (uint8_t i = 0; i < anzahl; i++) {
    digitalWrite(PIN_LED, HIGH);
    delay(dauer);
    digitalWrite(PIN_LED, LOW);
    delay(dauer);
  }
}

static bool hexNachBytes(const String& hex, uint8_t* aus, size_t ausLaenge) {
  if (hex.length() != ausLaenge * 2) return false;
  for (size_t i = 0; i < ausLaenge; i++) {
    aus[i] = (uint8_t)strtoul(hex.substring(i * 2, i * 2 + 2).c_str(), nullptr, 16);
  }
  return true;
}

static String hmacHex(const String& schluesselHex, const String& daten) {
  uint8_t schluessel[32];
  if (!hexNachBytes(schluesselHex, schluessel, sizeof(schluessel))) return "";

  uint8_t ergebnis[32];
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);

  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, schluessel, sizeof(schluessel));
  mbedtls_md_hmac_update(&ctx, (const uint8_t*)daten.c_str(), daten.length());
  mbedtls_md_hmac_finish(&ctx, ergebnis);
  mbedtls_md_free(&ctx);

  char hex[65];
  for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", ergebnis[i]);
  hex[64] = '\0';
  return String(hex);
}

/** Zahl aus einer flachen JSON-Antwort holen, ohne Parser-Bibliothek. */
static long jsonZahl(const String& json, const char* schluessel, long standard) {
  String suche = String("\"") + schluessel + "\":";
  int start = json.indexOf(suche);
  if (start < 0) return standard;
  start += suche.length();
  while (start < (int)json.length() && json[start] == ' ') start++;
  int ende = start;
  while (ende < (int)json.length() && (isdigit(json[ende]) || json[ende] == '-')) ende++;
  if (ende == start) return standard;
  return json.substring(start, ende).toInt();
}

// ---------------------------------------------------------------------------
// Ultraschallmessung
//
// Der A02YYUW schickt fortlaufend Vierbyte-Rahmen:
//   0xFF | Abstand High | Abstand Low | Pruefsumme
// Wir sammeln mehrere Rahmen und nehmen den Median - so fallen einzelne
// Fehlmessungen an Kanten und Falten im Fuellgut heraus.
// ---------------------------------------------------------------------------
static int16_t abstandMessen() {
  digitalWrite(PIN_SENSOR_POWER, HIGH);
  delay(150);  // Anlaufzeit des Sensors

  sensorSeriell.begin(9600, SERIAL_8N1, PIN_SENSOR_RX, PIN_SENSOR_TX);
  while (sensorSeriell.available()) sensorSeriell.read();

  int16_t  werte[MESSUNGEN_JE_DURCHGANG];
  uint8_t  anzahl = 0;
  uint8_t  rahmen[4];
  uint8_t  gefuellt = 0;
  uint32_t bis = millis() + MESS_TIMEOUT_MS;

  while (anzahl < MESSUNGEN_JE_DURCHGANG && millis() < bis) {
    if (!sensorSeriell.available()) {
      delay(5);
      continue;
    }

    uint8_t byteWert = sensorSeriell.read();
    if (gefuellt == 0 && byteWert != 0xFF) continue;  // auf Rahmenanfang warten

    rahmen[gefuellt++] = byteWert;
    if (gefuellt < 4) continue;
    gefuellt = 0;

    uint8_t summe = (rahmen[0] + rahmen[1] + rahmen[2]) & 0xFF;
    if (summe != rahmen[3]) continue;

    int16_t abstand = (rahmen[1] << 8) | rahmen[2];
    if (abstand < ABSTAND_MIN_MM || abstand > ABSTAND_MAX_MM) continue;

    werte[anzahl++] = abstand;
  }

  sensorSeriell.end();
  digitalWrite(PIN_SENSOR_POWER, LOW);

  if (anzahl == 0) return -1;

  // einfacher Einfuegesortierer, dann Median
  for (uint8_t i = 1; i < anzahl; i++) {
    int16_t wert = werte[i];
    int8_t j = i - 1;
    while (j >= 0 && werte[j] > wert) {
      werte[j + 1] = werte[j];
      j--;
    }
    werte[j + 1] = wert;
  }

  return werte[anzahl / 2];
}

// ---------------------------------------------------------------------------
// Modem
// ---------------------------------------------------------------------------
static void modemEinschalten() {
  pinMode(PIN_MODEM_PWRKEY, OUTPUT);
  digitalWrite(PIN_MODEM_PWRKEY, LOW);
  delay(100);
  digitalWrite(PIN_MODEM_PWRKEY, HIGH);
  delay(1000);  // >1 s haelt den PWRKEY gedrueckt
  digitalWrite(PIN_MODEM_PWRKEY, LOW);

  pinMode(PIN_MODEM_DTR, OUTPUT);
  digitalWrite(PIN_MODEM_DTR, LOW);  // Modem wach halten

  modemSeriell.begin(115200, SERIAL_8N1, PIN_MODEM_RX, PIN_MODEM_TX);
  delay(3000);
}

static void modemAusschalten() {
  modem.poweroff();
  delay(300);
  modemSeriell.end();
}

static bool netzVerbinden() {
  Serial.println("Modem wird gestartet ...");
  if (!modem.testAT(10000)) {
    Serial.println("Modem antwortet nicht.");
    return false;
  }

  modem.setNetworkMode(38);          // nur LTE
  modem.setPreferredMode(FUNKART);   // Cat-M / NB-IoT

  Serial.println("Warte auf Netz ...");
  if (!modem.waitForNetwork(NETZ_TIMEOUT_MS, true)) {
    Serial.println("Kein Netz.");
    return false;
  }

  Serial.println("Baue Datenverbindung auf ...");
  if (!modem.gprsConnect(APN, APN_BENUTZER, APN_PASSWORT)) {
    Serial.println("APN-Verbindung fehlgeschlagen.");
    return false;
  }

  return modem.isGprsConnected();
}

/** Uhrzeit vom Netz holen; ohne gueltige Zeit ist keine Signatur moeglich. */
static bool zeitHolen() {
  modem.NTPServerSync("pool.ntp.org", 20);

  int jahr = 0, monat = 0, tag = 0, stunde = 0, minute = 0, sekunde = 0;
  float zeitzone = 0;

  for (uint8_t versuch = 0; versuch < 3; versuch++) {
    if (modem.getNetworkTime(&jahr, &monat, &tag, &stunde, &minute, &sekunde, &zeitzone) && jahr > 2020) {
      struct tm zeit = {};
      zeit.tm_year = jahr - 1900;
      zeit.tm_mon = monat - 1;
      zeit.tm_mday = tag;
      zeit.tm_hour = stunde;
      zeit.tm_min = minute;
      zeit.tm_sec = sekunde;

      setenv("TZ", "UTC0", 1);
      tzset();

      time_t unix = mktime(&zeit) - (time_t)(zeitzone * 3600.0f);
      struct timeval tv = {.tv_sec = unix, .tv_usec = 0};
      settimeofday(&tv, nullptr);
      return true;
    }
    delay(2000);
  }

  return false;
}

// ---------------------------------------------------------------------------
// Erstinbetriebnahme: Schluessel abholen (nur einmal je Geraet moeglich)
// ---------------------------------------------------------------------------
static bool schluesselAbholen() {
  if (strlen(GERAETE_PROVISIONIERUNG) == 0) return false;

  TinyGsmClientSecure netz(modem);
  HttpClient http(netz, SERVER_HOST, SERVER_PORT);
  http.setTimeout(HTTP_TIMEOUT_MS);

  String rumpf = String("{\"geraete_id\":\"") + GERAETE_ID + "\",\"imei\":\"" + modem.getIMEI() +
                 "\",\"iccid\":\"" + modem.getSimCCID() + "\",\"firmware\":\"" + FIRMWARE_VERSION + "\"}";

  http.beginRequest();
  http.post(SERVER_PFAD_REG);
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("Content-Length", rumpf.length());
  http.sendHeader("X-Provisionierung", GERAETE_PROVISIONIERUNG);
  http.beginBody();
  http.print(rumpf);
  http.endRequest();

  int status = http.responseStatusCode();
  String antwort = http.responseBody();
  http.stop();

  if (status != 200) {
    Serial.printf("Provisionierung abgelehnt (HTTP %d): %s\n", status, antwort.c_str());
    return false;
  }

  int start = antwort.indexOf("\"geheimnis\":\"");
  if (start < 0) return false;
  start += 13;
  int ende = antwort.indexOf('"', start);
  if (ende < 0) return false;

  geraeteSchluessel = antwort.substring(start, ende);
  speicher.putString("schluessel", geraeteSchluessel);
  Serial.println("Geraeteschluessel erhalten und gespeichert.");
  return true;
}

// ---------------------------------------------------------------------------
// Senden
// ---------------------------------------------------------------------------
static bool messungSenden(const Gepuffert& m) {
  if (geraeteSchluessel.length() != 64) {
    Serial.println("Kein Geraeteschluessel vorhanden.");
    return false;
  }

  char zeitstempel[16];
  snprintf(zeitstempel, sizeof(zeitstempel), "%lu", (unsigned long)time(nullptr));

  String rumpf = "{";
  rumpf += "\"abstand_mm\":" + String(m.abstand_mm);
  rumpf += ",\"batterie_v\":" + String(m.batterie_mv / 1000.0, 2);
  rumpf += ",\"temperatur_c\":" + String(m.temperatur_zehntel / 10.0, 1);
  rumpf += ",\"rssi\":" + String(m.rssi);
  rumpf += ",\"anlass\":\"" + String(ANLASS_TEXT[m.anlass <= 2 ? m.anlass : 0]) + "\"";
  rumpf += ",\"firmware\":\"" FIRMWARE_VERSION "\"";
  if (m.zeit > 1700000000UL) {
    char iso[32];
    time_t roh = (time_t)m.zeit;
    struct tm zeit;
    gmtime_r(&roh, &zeit);
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &zeit);
    rumpf += ",\"gemessen_am\":\"" + String(iso) + "\"";
  }
  rumpf += "}";

  String signatur = hmacHex(geraeteSchluessel, String(GERAETE_ID) + "." + zeitstempel + "." + rumpf);
  if (signatur.length() == 0) return false;

  TinyGsmClientSecure netz(modem);
  HttpClient http(netz, SERVER_HOST, SERVER_PORT);
  http.setTimeout(HTTP_TIMEOUT_MS);

  http.beginRequest();
  http.post(SERVER_PFAD);
  http.sendHeader("Content-Type", "application/json");
  http.sendHeader("Content-Length", rumpf.length());
  http.sendHeader("X-Geraet-Id", GERAETE_ID);
  http.sendHeader("X-Zeitstempel", zeitstempel);
  http.sendHeader("X-Signatur", signatur);
  http.beginBody();
  http.print(rumpf);
  http.endRequest();

  int status = http.responseStatusCode();
  String antwort = http.responseBody();
  http.stop();

  Serial.printf("HTTP %d: %s\n", status, antwort.c_str());
  if (status != 200) return false;

  // Das Backend gibt das gewuenschte Sendeintervall zurueck - so laesst es
  // sich aus der Oberflaeche heraus aendern, ohne neu zu flashen.
  long intervall = jsonZahl(antwort, "intervall_minuten", rtcIntervall);
  if (intervall >= 15 && intervall <= 1440) rtcIntervall = (uint16_t)intervall;

  // Serverzeit als Notnagel, falls das Netz keine Uhrzeit liefert
  long serverzeit = jsonZahl(antwort, "serverzeit", 0);
  if (serverzeit > 1700000000L) {
    struct timeval tv = {.tv_sec = (time_t)serverzeit, .tv_usec = 0};
    settimeofday(&tv, nullptr);
  }

  return true;
}

static void puffern(const Gepuffert& m) {
  if (rtcPufferAnzahl < PUFFER_GROESSE) {
    rtcPuffer[rtcPufferAnzahl++] = m;
    return;
  }
  // Puffer voll: aeltesten Eintrag verwerfen
  for (uint8_t i = 1; i < PUFFER_GROESSE; i++) rtcPuffer[i - 1] = rtcPuffer[i];
  rtcPuffer[PUFFER_GROESSE - 1] = m;
}

static void pufferLeeren() {
  uint8_t verblieben = 0;
  for (uint8_t i = 0; i < rtcPufferAnzahl; i++) {
    if (!messungSenden(rtcPuffer[i])) {
      rtcPuffer[verblieben++] = rtcPuffer[i];
    }
    delay(200);
  }
  rtcPufferAnzahl = verblieben;
}

// ---------------------------------------------------------------------------
// Schlafen
// ---------------------------------------------------------------------------
static void schlafen(uint16_t minuten) {
  Serial.printf("Schlafe %u Minuten.\n", minuten);
  Serial.flush();

  digitalWrite(PIN_SENSOR_POWER, LOW);
  digitalWrite(PIN_LED, LOW);

  esp_sleep_enable_timer_wakeup((uint64_t)minuten * 60ULL * 1000000ULL);

  // Taster am Gehaeuse weckt sofort auf (aktiv LOW)
  rtc_gpio_pullup_en((gpio_num_t)PIN_TASTER);
  rtc_gpio_pulldown_dis((gpio_num_t)PIN_TASTER);
  esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_TASTER, 0);

  esp_deep_sleep_start();
}

// ---------------------------------------------------------------------------
// Hauptablauf
// ---------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);

  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_SENSOR_POWER, OUTPUT);
  digitalWrite(PIN_SENSOR_POWER, LOW);
  pinMode(PIN_TASTER, INPUT_PULLUP);

  rtcBootzaehler++;
  esp_sleep_wakeup_cause_t grund = esp_sleep_get_wakeup_cause();

  uint8_t anlass = 0;  // intervall
  if (grund == ESP_SLEEP_WAKEUP_EXT0) {
    anlass = 1;  // Taster
  } else if (grund != ESP_SLEEP_WAKEUP_TIMER) {
    anlass = 2;  // Kaltstart
  }

  Serial.printf("\n== %s / Firmware %s / Start %lu / Anlass %s ==\n",
                GERAETE_ID, FIRMWARE_VERSION, (unsigned long)rtcBootzaehler, ANLASS_TEXT[anlass]);

  speicher.begin("sensor", false);
  geraeteSchluessel = strlen(GERAETE_KEY) == 64 ? String(GERAETE_KEY) : speicher.getString("schluessel", "");

  // 1. Messen (noch ohne Funk - das spart Strom, falls das Netz streikt)
  int16_t abstand = abstandMessen();
  Serial.printf("Abstand: %d mm\n", abstand);

  if (anlass == 1) ledBlinken(2);  // Quittung fuer den Taster

  // 2. Funk
  modemEinschalten();
  bool verbunden = netzVerbinden();

  Gepuffert messung = {};
  messung.abstand_mm = abstand;
  messung.anlass = anlass;
  messung.rssi = verbunden ? modem.getSignalQuality() : 0;
  messung.batterie_mv = 0;
  messung.temperatur_zehntel = 0;

  if (verbunden) {
    // Batteriespannung liest das Modem selbst aus (AT+CBC)
    int prozent = 0, spannung = 0;
    uint8_t status = 0;
    if (modem.getBattStats(status, prozent, spannung)) {
      messung.batterie_mv = (uint16_t)spannung;
    }

    if (zeitHolen()) {
      messung.zeit = (uint32_t)time(nullptr);
    }

    if (geraeteSchluessel.length() != 64) {
      schluesselAbholen();
    }

    bool gesendet = false;
    if (abstand > 0) {
      for (uint8_t versuch = 0; versuch < SENDEVERSUCHE && !gesendet; versuch++) {
        gesendet = messungSenden(messung);
        if (!gesendet) delay(3000);
      }
    }

    if (!gesendet && abstand > 0) {
      Serial.println("Senden fehlgeschlagen - Messung wird gepuffert.");
      puffern(messung);
    } else if (rtcPufferAnzahl > 0) {
      Serial.printf("%u gepufferte Messungen werden nachgereicht.\n", rtcPufferAnzahl);
      pufferLeeren();
    }

    if (gesendet && anlass == 1) ledBlinken(3, 80);  // Anlernquittung
  } else {
    Serial.println("Ohne Netz - Messung wird gepuffert.");
    if (abstand > 0) puffern(messung);
    ledBlinken(1, 600);
  }

  modemAusschalten();
  speicher.end();

  schlafen(rtcIntervall);
}

void loop() {
  // wird nie erreicht: nach setup() geht das Geraet in den Tiefschlaf
}
