# Firmware Füllstandsensor

ESP32-S3 + SIM7080G (Cat-M / NB-IoT) + Ultraschallsensor A02YYUW.
Gebaut mit [PlatformIO](https://platformio.org/).

## Was die Firmware tut

Bei jedem Aufwachen – per Zeitgeber oder durch den Taster/Magnetkontakt am
Gehäuse:

1. Ultraschallsensor bestromen, sieben Messungen nehmen, **Median** bilden
2. Modem hochfahren, einbuchen, Uhrzeit und Batteriespannung holen
3. Messung signieren (HMAC-SHA256) und per HTTPS an `/api/ingest` senden
4. Zuvor nicht zugestellte Messungen aus dem Puffer nachreichen
5. Modem abschalten, bis zum nächsten Termin tief schlafen

Ohne Netz wird die Messung im RTC-Speicher gepuffert (bis zu 24 Stück) und beim
nächsten Mal nachgereicht. Das Sendeintervall kommt in der Serverantwort – eine
Änderung in der Oberfläche greift bei der nächsten Meldung.

Der Taster löst eine Sofortmessung mit Anlass `taster` aus. Genau die braucht
das Backend beim Anlernen und Kalibrieren.

## Bauen und flashen

```bash
cd firmware/altkleider-sensor

cp include/geheimnisse.beispiel.h include/geheimnisse.h
# GERAETE_ID und GERAETE_KEY eintragen (stehen im Backend unter
# Sensoren -> Gerät aufnehmen; der Schlüssel wird nur einmal angezeigt)

pio run                 # bauen
pio run -t upload       # flashen
pio device monitor      # Ausgabe mitlesen
```

In `include/konfiguration.h` gehören vor dem ersten Bauen angepasst:

| Wert | Beispiel |
|---|---|
| `SERVER_HOST` | `fuellstand.example.vercel.app` |
| `APN` | `iot.1nce.net` |
| `STANDARD_INTERVALL_MINUTEN` | `360` (4× täglich) |
| Pinbelegung | siehe [../../docs/hardware.md](../../docs/hardware.md) |

`include/geheimnisse.h` steht in `.gitignore` und gehört **nicht** ins
Repository.

### Eine Firmware für alle Geräte

Statt jedes Gerät einzeln zu flashen: `GERAETE_KEY` leer lassen und
`GERAETE_PROVISIONIERUNG` auf den Werksschlüssel des Backends setzen. Beim
ersten Start holt sich die Box ihren eigenen Schlüssel ab und legt ihn dauerhaft
im internen Speicher ab. Das geht pro Gerät genau einmal.

Die Geräte-ID muss dann trotzdem je Gerät stimmen – entweder beim Flashen
gesetzt oder aus der IMEI abgeleitet.

## Rückmeldung über die LED

| Signal | Bedeutung |
|---|---|
| 2× kurz | Taster erkannt, Messung läuft |
| 3× kurz schnell | Messung erfolgreich übertragen |
| 1× lang | kein Netz – Messung wurde gepuffert |

## Stand

Die Firmware ist vollständig ausformuliert, aber **noch nicht auf echter
Hardware erprobt** und im Rahmen dieses Projekts auch nicht kompiliert worden
(die PlatformIO-Registry ist aus der Entwicklungsumgebung heraus nicht
erreichbar). Vor dem Ausrollen also unbedingt:

1. `pio run` – Übersetzung prüfen, Bibliotheksversionen ziehen
2. Pinbelegung gegen die tatsächliche Platine prüfen
3. Auf dem Schreibtisch gegen die echte Instanz testen: Taster drücken, in der
   Oberfläche unter *Sensoren* muss die Meldung binnen einer Minute stehen
4. Messgenauigkeit gegen den Zollstock prüfen (Abstand 30 cm / 1 m / 2 m)
5. Erst dann eine Box in einen Container hängen
