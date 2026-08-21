#pragma once

// ---------------------------------------------------------------------------
// Firmware-Einstellungen
//
// Die geraetespezifischen Werte (ID und Schluessel) stehen NICHT hier, sondern
// in geheimnisse.h - diese Datei wird nicht eingecheckt. Vorlage:
// geheimnisse.beispiel.h
// ---------------------------------------------------------------------------

#define FIRMWARE_VERSION "1.0.0"

// --- Server ---------------------------------------------------------------
// Ohne "https://" und ohne Pfad.
#define SERVER_HOST      "fuellstand.example.vercel.app"
#define SERVER_PORT      443
#define SERVER_PFAD      "/api/ingest"
#define SERVER_PFAD_REG  "/api/geraete/registrieren"

// --- Mobilfunk ------------------------------------------------------------
// 1NCE: "iot.1nce.net", kein Benutzer/Passwort.
#define APN              "iot.1nce.net"
#define APN_BENUTZER     ""
#define APN_PASSWORT     ""

// Bevorzugte Funkart: 1 = Cat-M, 2 = NB-IoT, 3 = beides (Cat-M zuerst).
#define FUNKART          3

// --- Messung --------------------------------------------------------------
#define STANDARD_INTERVALL_MINUTEN 360   // 4 Meldungen pro Tag
#define MESSUNGEN_JE_DURCHGANG     7     // davon wird der Median genommen
#define MESS_TIMEOUT_MS            2500

// Plausibilitaetsgrenzen des A02YYUW (in Millimetern)
#define ABSTAND_MIN_MM   30
#define ABSTAND_MAX_MM   4500

// --- Netz -----------------------------------------------------------------
#define NETZ_TIMEOUT_MS      120000L   // Einbuchen
#define HTTP_TIMEOUT_MS      30000L
#define SENDEVERSUCHE        2

// Ungesendete Messungen ueberdauern den Tiefschlaf im RTC-Speicher.
#define PUFFER_GROESSE       24

// --- Pinbelegung ----------------------------------------------------------
// Werte fuer die LilyGO T-SIM7080G-S3. Bei einer anderen Platine gegen deren
// utilities.h bzw. Pinout pruefen!
#define PIN_MODEM_RX     4      // ESP32 empfaengt vom Modem
#define PIN_MODEM_TX     5      // ESP32 sendet zum Modem
#define PIN_MODEM_PWRKEY 41
#define PIN_MODEM_DTR    42

// Eigene Beschaltung (frei waehlbare GPIOs auf der Stiftleiste)
#define PIN_SENSOR_RX    18     // Datenleitung des A02YYUW (weiss)
#define PIN_SENSOR_TX    17     // wird nicht benutzt, muss aber belegt sein
#define PIN_SENSOR_POWER 16     // schaltet den Ultraschallsensor ein (MOSFET)
#define PIN_TASTER       15     // Anlern-/Testtaster gegen GND
#define PIN_LED          21     // Status-LED (mit Vorwiderstand)

// Batteriespannung wird ueber das Modem gelesen (AT+CBC). Wer stattdessen
// einen Spannungsteiler an einem ADC nutzt, setzt hier den Pin und den Faktor.
// #define PIN_BATTERIE_ADC 3
// #define BATTERIE_TEILER  2.0f
