# Hardware – Vorschlag und Stückliste

> **Bevor Sie hier weiterlesen:** Ob überhaupt selbst gebaut werden soll, ist
> eine eigene Frage – es gibt Fertiggeräte ab rund 99 €, die dasselbe können.
> Der Vergleich steht in der
> **[Entscheidungsvorlage](sensor-entscheidung.md)**. Dieses Dokument
> beschreibt den Eigenbau.

> **Wer einen Sensor bauen will und noch nie gelötet hat**, nimmt die
> **[Sensor-Bauanleitung.docx](Sensor-Bauanleitung.docx)** – dort steht jeder
> Handgriff einzeln. Dieses Dokument hier ist die technische Begründung
> dahinter: warum diese Bauteile, wie der Stromhaushalt aussieht, worauf es
> bei der Montage ankommt.

Auslegung: **50–300 Container, vier Messungen pro Tag**, Betrieb ohne Wartung
über mindestens eine Saison, Montage unter dem Deckel eines Metallcontainers.

---

## 1. Stückliste je Sensorbox

| Teil | Vorschlag | Warum | ca. Preis |
|---|---|---|---|
| Controller + Funkmodul | **LilyGO T-SIM7080G-S3** (ESP32-S3 + SIM7080G) | Controller, Cat-M/NB-IoT-Modem, SIM-Slot, 18650-Halter und Solareingang auf einer Platine – spart Verdrahtung und Fehlerquellen | 45–55 € |
| Ultraschallsensor | **DFRobot A02YYUW (SEN0311)** | wasserdicht (IP67), 3 cm–4,5 m, gibt den Abstand fertig als Zahl über UART aus – kein zeitkritisches Echo-Messen | 25–30 € |
| IoT-SIM | **1NCE 10-Jahres-Tarif** (500 MB, NB-IoT/LTE-M über Telekom) | einmalig bezahlt, keine monatliche Rechnung je Container | ~10 € einmalig |
| Antenne | LTE-Klebeantenne mit u.FL/IPEX → SMA, 1–2 m Kabel | **muss außerhalb des Metallcontainers sitzen** (siehe Abschnitt 4) | 8–12 € |
| Batterie – Pilot | 1× 18650 Li-Ion 3400 mAh (z. B. Panasonic NCR18650B) | Halter ist auf der Platine, sofort startklar | 8–10 € |
| Batterie – Dauerbetrieb | 2× **LiSOCl₂ ER34615** (D-Zelle, 3,6 V, 19 Ah) parallel + Schottky-Diode + 1 F Stützkondensator | hält Jahre, verträgt Frost bis −40 °C, kein Nachladen nötig – **Sicherheitshinweis unten beachten** | 25–35 € |
| Gehäuse | IP67-ABS-Kasten ca. 115 × 90 × 55 mm, zwei Verschraubungen M12 | Feuchtigkeit und Textilstaub | 10–15 € |
| Auslösekontakt | **Reed-Kontakt + Magnet** (bevorzugt) oder IP67-Drucktaster 12 mm | löst Sofortmessung beim Anlernen aus; der Reed-Kontakt braucht kein Loch im Gehäuse | 3–8 € |
| Status-LED | 3 mm LED hinter transluzentem Gehäusedeckel, 1 kΩ Vorwiderstand | Rückmeldung beim Anlernen | < 1 € |
| Kleinteile | N-Kanal-MOSFET (z. B. 2N7002) für die Sensorabschaltung, Widerstände, Butylband, Kabelbinder | | 3–5 € |

**Summe je Container: rund 108–145 €** (Pilot mit 18650) bzw. **126–168 €**
(Dauerbetrieb mit LiSOCl₂), zuzüglich SIM.

> Konkrete Produkte, Bezugsquellen und eine Hochrechnung auf 5, 20, 50 und 300
> Boxen stehen in der **[Einkaufsliste](einkaufsliste.md)**.

Für den Anfang genügen **drei bis fünf Boxen** an gut erreichbaren Standorten mit
unterschiedlichem Nutzungsverhalten – daraus ergibt sich, ob vier Messungen am
Tag reichen und wie schnell die Container tatsächlich volllaufen.

---

## 2. Verdrahtung

| Sensor A02YYUW | Ziel auf der Platine | Hinweis |
|---|---|---|
| VCC (rot) | Drain des MOSFET, Source an 3V3 bzw. VBAT | Sensor wird nur während der Messung bestromt |
| GND (schwarz) | GND | |
| Datenleitung „TX“ | **GPIO 18** (`PIN_SENSOR_RX`) | Farbcode je Charge unterschiedlich – im Datenblatt prüfen |
| Steuerleitung „RX“ | GPIO 17 (`PIN_SENSOR_TX`) | wird nicht benutzt, bleibt aber definiert |

| Weiteres | Pin |
|---|---|
| MOSFET-Gate (Sensorversorgung) | GPIO 16 (`PIN_SENSOR_POWER`) |
| Reed-Kontakt / Taster gegen GND | GPIO 15 (`PIN_TASTER`), interner Pull-up |
| Status-LED (+ 1 kΩ) | GPIO 21 (`PIN_LED`) |
| Modem UART / PWRKEY / DTR | GPIO 4 / 5 / 41 / 42 – bereits auf der Platine verdrahtet |

Die Modem-Pins stammen aus der `utilities.h` von LilyGO für die
T-SIM7080G-S3. Die drei frei gewählten GPIOs (16, 17, 18, 15, 21) sind in
`firmware/altkleider-sensor/include/konfiguration.h` an einer Stelle
zusammengefasst und lassen sich an die tatsächlich herausgeführte Stiftleiste
anpassen.

---

## 3. Montage im Container

```
        ┌──────── Deckel ────────┐
        │   ▓ Sensorbox (innen)  │      Antenne nach außen geführt
        │   │                    │
        │   ▼ Ultraschallkegel   │
        │  ／  ＼                 │
        │ ／     ＼               │   einbauhoehe_mm   = Sensor → Boden
        │        …                │   voll_abstand_mm  = Deckel → „voll“
        └── Füllgut ─────────────┘
```

* Sensor **mittig im Deckel**, senkrecht nach unten. Nicht über der
  Einwurfklappe – dort misst er die Klappe statt das Füllgut.
* Die **Blindzone von 3 cm** einhalten: der Sensor darf nicht bündig auf dem
  Blech aufliegen, sondern 3–5 cm tiefer hängen. Der gemessene Versatz zwischen
  Sensorunterkante und Deckelinnenseite wird im Backend als
  *Montageversatz* eingetragen und automatisch herausgerechnet.
* Membran freihalten: ein Gitter oder ein 2 cm überstehender Kragen verhindert,
  dass hochgeworfene Textilien direkt auf dem Sensor liegen bleiben.
* Verschraubungen mit Butylband abdichten, Kabel als Tropfschlaufe verlegen.

---

## 4. Der wichtigste Punkt: die Antenne

Ein Altkleidercontainer aus Stahl ist ein **faradayscher Käfig**. Eine Antenne
im Innenraum bringt so gut wie keine Verbindung zustande – das ist der häufigste
Grund, warum solche Aufbauten „manchmal“ funktionieren.

Deshalb:

* Klebeantenne **außen** anbringen, bevorzugt unter einer Kunststoffabdeckung,
  im Schriftfeld oder unter der Einwurfklappe – geschützt vor Vandalismus, aber
  ohne Blech dazwischen.
* Antennenkabel durch eine abgedichtete Verschraubung führen.
* NB-IoT/LTE-M dringt zwar deutlich besser in Gebäude ein als klassisches LTE,
  aber auch das ersetzt keine Antenne außerhalb des Blechs.

Vor dem Ausrollen an einem Standort einmal die Empfangsfeldstärke prüfen: der
Wert `rssi` steht nach jeder Meldung in der Containerdetailansicht. Unter
etwa −105 dBm sollte die Antennenposition geändert werden.

---

## 5. Stromverbrauch – überschlägig

| Posten | Annahme | pro Tag |
|---|---|---|
| Tiefschlaf ESP32-S3 + Modem in PSM | ca. 100 µA | 2,4 mAh |
| Messung (Sensor 0,5 s an, 20 mA) | 4× täglich | 0,05 mAh |
| Funkstrecke: Einbuchen + Senden | 4× ca. 12 s, im Mittel 120 mA | ca. 1,6 mAh |
| **Summe** | | **rund 4–5 mAh** |

Daraus folgt:

| Batterie | rechnerisch | realistisch (Kälte, Alterung, Verbindungsabbrüche) |
|---|---|---|
| 1× 18650, 3400 mAh | ca. 2 Jahre | **9–15 Monate** |
| 2× ER34615, 38 Ah | > 10 Jahre | **4–6 Jahre** |

Bei Cat-M/NB-IoT dominiert das Einbuchen. Ein schlechter Standort, an dem das
Modem jedes Mal 60 statt 12 Sekunden sucht, vervierfacht den Verbrauch – ein
weiteres Argument für die Antenne außen.

**Solarmodul**: Die Platine kann laden, aber im Containerinneren gibt es kein
Licht, und ein außen angebrachtes Modul ist ein Ziel für Vandalismus. Wir
empfehlen daher Primärzellen (LiSOCl₂) statt Solar.

### Sicherheitshinweis zu Primärzellen

LiSOCl₂-Zellen sind **nicht aufladbar**, die Platine hat aber eine
Ladeschaltung für USB und Solar. Daraus folgen zwei Regeln, die keine
Empfehlung sind, sondern eingehalten werden müssen:

1. **Schottky-Diode in Reihe zum Pluspol** (SS14 oder 1N5819). Sie sperrt
   jeden Rückstrom in die Zellen. Ihr Spannungsabfall von etwa 0,3 V ist
   eingeplant – 3,6 V minus 0,3 V liegt weiterhin über der Mindestspannung
   des Funkmoduls.
2. **Vor jedem USB-Anschluss den Batteriepack abklemmen** – auch mit Diode.
   Ein Aufkleber im Gehäusedeckel erinnert daran.

Dazu die elektrische Eigenheit dieser Zellen: sie liefern nur rund 200 mA
dauerhaft, das Funkmodul zieht beim Senden kurzzeitig bis zu 2 A. Deshalb zwei
Zellen parallel **und** ein Stützkondensator (1 F Goldcap über 10 Ω), der die
Spitzen abfängt. Das ist der Teil des Aufbaus, den man vor dem Bau größerer
Stückzahlen einmal nachmessen sollte.

---

## 6. Wetter und Umgebung

* Temperaturbereich: LiSOCl₂ −40 bis +85 °C, Li-Ion nutzbar bis etwa −20 °C
  (mit deutlichem Kapazitätsverlust). Geladen wird ohnehin nicht.
* Ultraschall misst über die Laufzeit; der A02YYUW rechnet die Temperatur intern
  heraus. Bei starkem Frost und Reifbildung auf der Membran kann eine Messung
  ausfallen – deshalb bildet die Firmware den **Median aus sieben Messungen** und
  meldet lieber gar nichts als einen Fantasiewert.
* Ungültige Werte (Abstand ≤ 0, > 6 m) markiert das Backend automatisch als
  ungültig, statt sie in die Kurve zu übernehmen.

---

## 7. Bezugsquellen

Die Teile sind in Deutschland unter anderem bei Berrybase, Reichelt, Eckstein,
TinyTronics und direkt bei DFRobot erhältlich; die SIM-Karten bei 1NCE.
Preise Stand 2026 und ohne Gewähr.
