# Einkaufsliste Sensorbox

Alles, was für **eine** Sensorbox gebraucht wird, mit Bezugsquellen und
Preisrahmen.

> **Zu den Preisen:** Richtwerte inklusive Mehrwertsteuer, ohne Versand,
> Stand August 2026. Die Shopseiten waren aus der Entwicklungsumgebung heraus
> nicht abrufbar (Netzsperre), die Preise stammen also aus Suchergebnissen und
> Erfahrungswerten – vor der Bestellung bitte gegenprüfen. Wo ich keine
> gesicherte Produktseite habe, steht statt eines Links der Shop und der genaue
> Suchbegriff. Das ist ehrlicher als ein Link, der ins Leere führt.

---

## Zwei Ausbaustufen

**Variante A – Pilot.** Mit 18650-Zelle. Der Halter sitzt schon auf der
Platine, keine Zusatzelektronik, in einer Stunde aufgebaut. Läuft neun bis
fünfzehn Monate. **Damit anfangen.**

**Variante B – Dauerbetrieb.** Mit Lithium-Thionylchlorid-Zellen. Vier bis
sechs Jahre Laufzeit und frostfest bis −40 °C, dafür zwei Bauteile mehr und ein
paar Regeln, die eingehalten werden müssen (siehe unten). Sinnvoll, sobald der
Pilot gezeigt hat, dass Standort und Messwerte passen.

---

## Grundausstattung (in beiden Varianten gleich)

| # | Teil | Konkretes Produkt | Bezugsquelle | ca. Preis |
|---|---|---|---|---|
| 1 | Controller + Funkmodul | LilyGO **T-SIM7080G-S3** (ESP32-S3, SIM7080G, Cat-M/NB-IoT, 16 MB Flash, 8 MB PSRAM) | [Herstellerseite](https://lilygo.cc/en-us/products/t-sim7080-s3) · [AliExpress, LilyGO-Store](https://www.aliexpress.com/item/1005005188988179.html) · [Amazon.de](https://www.amazon.de/dp/B0BW3NN54L) · [Tindie](https://www.tindie.com/products/lilygo/t-sim7080g-s3-esp32-s3-sim7080-development/) | **45–60 €** |
| 2 | Ultraschallsensor | DFRobot **A02YYUW** (SEN0311), IP67, 3–450 cm, UART | [DFRobot](https://www.dfrobot.com/product-1935.html) · [Botland](https://botland.store/ultrasonic-distance-sensors/15717-a02yyuw-ultrasonic-distance-sensor-3-450cm-waterproof-dfrobot-sen0311-5904422377984.html) · [DigiKey](https://www.digikey.com/en/products/detail/dfrobot/SEN0311/11202577) · [Datenblatt](https://wiki.dfrobot.com/sen0311/) | **17–25 €** |
| 3 | IoT-SIM (Nano) | **1NCE**, 500 MB + 250 SMS, LTE-M/NB-IoT über Telekom | [1nce.com – IoT SIM Europa](https://1nce.com/de-de/1nce-connect/sim-karten/iot-sim-europa) | **12 € einmalig für 10 Jahre** |
| 4 | LTE-Antenne | Klebeantenne 698–2700 MHz mit u.FL/IPEX-Anschluss, 20–100 cm Kabel | [Data Alliance – Klebeantenne mit u.FL](https://www.data-alliance.net/embedded-antenna-lte-adhesive-mount-with-ufl-connector/) · [RS Components – TE Multiband](https://de.rs-online.com/web/p/multi-band-antennen/2131895) · Reichelt/Berrybase: *„LTE Antenne IPEX 698-2700"* | **8–14 €** |
| 5 | Antennenverlängerung | u.FL auf SMA, ca. 15 cm (nur nötig, wenn die Antenne durch die Gehäusewand geht) | [Adafruit 851](https://www.adafruit.com/product/851) · Reichelt: *„Pigtail SMA u.FL"* | **4–7 €** |
| 6 | Gehäuse | IP66/67-ABS-Kasten, ca. 115 × 90 × 55 mm, mit transparentem Deckel (für die LED) | Reichelt: *„Gehäuse IP67 ABS 115x90x55"* · Berrybase: *„Installationsgehäuse IP67"* | **9–15 €** |
| 7 | Kabelverschraubungen | 2 × M12, IP68, mit Dichtung (Sensorkabel, Antennenkabel) | Reichelt: *„Kabelverschraubung M12 IP68"* | **2 €** |
| 8 | Auslösekontakt | **Reed-Kontakt** (Schließer, Glasrohr) + Neodym-Magnet ⌀ 10 mm | Reichelt: *„Reed-Kontakt Schließer"* · Berrybase: *„Reed Schalter Magnet"* | **3–5 €** |
| 9 | Status-LED | LED 3 mm grün, diffus, + 1 kΩ Widerstand | Reichelt: *„LED 3mm grün diffus"* | **< 1 €** |
| 10 | Schalt-MOSFET | 2N7002 oder BSS138 (schaltet den Ultraschallsensor stromlos) + 10 kΩ + 100 Ω | Reichelt: *„2N7002"* | **< 1 €** |
| 11 | Dichtmasse | Butyl-Dichtband, 10 mm breit | Baumarkt | **< 1 € je Box** |
| 12 | Kleinteile | Litze 0,25 mm², Schrumpfschlauch, Kabelbinder, Klettband | Bestand | **1–2 €** |

**Zwischensumme Grundausstattung: rund 100–133 €**

### Variante A – Pilot

| # | Teil | Bezugsquelle | ca. Preis |
|---|---|---|---|
| A1 | 18650-Zelle, geschützt, 3400 mAh (z. B. Panasonic NCR18650B) | Reichelt/Akkuplus: *„18650 3400mAh geschützt"* | **8–12 €** |

**Summe Variante A: rund 108–145 € je Box.**

### Variante B – Dauerbetrieb

| # | Teil | Bezugsquelle | ca. Preis |
|---|---|---|---|
| B1 | 2 × **ER34615** LiSOCl₂, D-Zelle, 3,6 V, 19 Ah | [akkuman – 2er-Pack XCell](https://www.akkuman.de/shop/2x-XCell-Lithium-36V-Batterie-ER34615-D-Zelle-LS33600-Mono) · [akkuplus – Kraftmax](https://akkuplus.de/kraftmax-ER34615-D-Zelle-36-Volt-19000mAh) · [online-batterien – EVE](https://online-batterien.de/a/eve-er34615-bobbin-cell-d-rundzelle-lithium-thionylchlorid-3-6v-19000mah/9883290) · [Amazon.de – EEMB](https://www.amazon.de/dp/B07QR8VFL9) | **20–26 €** |
| B2 | 2 × Batteriehalter D-Zelle mit Lötfahnen | Reichelt: *„Batteriehalter Mono D"* | **3–4 €** |
| B3 | **Schottky-Diode** SS14 oder 1N5819, in Reihe zum Pluspol | Reichelt: *„1N5819"* | **< 1 €** |
| B4 | Stützkondensator 1 F / 5,5 V (Goldcap) + 10 Ω Ladewiderstand | Reichelt: *„Goldcap 1F 5,5V"* | **2–4 €** |

**Summe Variante B: rund 126–168 € je Box.**

---

## Zwei Sicherheitsregeln zu Variante B

Lithium-Thionylchlorid-Zellen sind **nicht aufladbar**. Die Platine hat aber
eine Ladeschaltung für Solar und USB. Deshalb:

1. **Die Schottky-Diode (B3) ist nicht optional.** Sie sitzt in Reihe zum
   Pluspol und sperrt jeden Rückstrom in die Zellen. Ohne sie versucht die
   Ladeschaltung, sobald jemand ein USB-Kabel einsteckt, eine Primärzelle zu
   laden – das endet im schlimmsten Fall damit, dass die Zelle ausgast oder
   brennt.
2. **Vor jedem USB-Anschluss den Batteriepack abklemmen.** Auch mit Diode:
   zum Flashen und zur Fehlersuche erst trennen, dann anstecken. Das gehört als
   Aufkleber ins Gehäuse.

Dazu kommt eine elektrische Eigenheit: LiSOCl₂-Zellen liefern nur etwa 200 mA
dauerhaft, das Funkmodul zieht beim Senden aber kurzzeitig bis zu 2 A. Deshalb
zwei Zellen parallel **und** der Stützkondensator (B4), der die Spitzen
abfängt. **Das ist der Teil des Aufbaus, den man auf dem Schreibtisch messen
sollte, bevor zwanzig Boxen gebaut werden** – wenn das Modem beim Senden
zusammenbricht, sieht man es genau hier.

Der Spannungsabfall an der Diode (etwa 0,3 V bei Schottky) ist eingeplant:
3,6 V minus 0,3 V bleibt über der Mindestspannung des Funkmoduls.

---

## Einmalig, nicht je Box

| Teil | Wozu | ca. Preis |
|---|---|---|
| Lötstation, Entlötlitze, Zinn | Verdrahtung | 40–80 € |
| Stufenbohrer bis 20 mm | Löcher für die Kabelverschraubungen | 12–20 € |
| Multimeter | Spannung und Stromaufnahme prüfen | 25–60 € |
| Heißluft oder Feuerzeug | Schrumpfschlauch | – |
| USB-C-Kabel (Datenkabel!) | Flashen | 5 € |
| Zollstock / Lasermessgerät | Innenhöhe der Container aufnehmen | – |

Ein **USB-Strommessgerät** (etwa 10–15 €) lohnt sich: damit lässt sich der
Ruhestrom nachmessen und die Laufzeitrechnung aus
[hardware.md](hardware.md#5-stromverbrauch--überschlägig) am realen Aufbau
bestätigen.

---

## Was kostet das im Ganzen

| Menge | Variante A (Pilot) | Variante B (Dauerbetrieb) | Anmerkung |
|---|---|---|---|
| **3 Boxen** (Pilot) | **330–435 €** | – | plus Werkzeug ca. 100–180 €, falls nicht vorhanden |
| **5 Boxen** | 540–725 € | 630–840 € | |
| **20 Boxen** | 2.160–2.900 € | 2.520–3.360 € | ab hier lohnen Mengenrabatte |
| **50 Boxen** | 5.400–7.250 € | 6.300–8.400 € | Platine und Sensor direkt beim Hersteller anfragen |
| **300 Boxen** (Vollausbau) | 32.400–43.500 € | 37.800–50.400 € | in dieser Größenordnung Angebote einholen |

Laufende Kosten: **die SIM-Karte ist mit 12 € für zehn Jahre bezahlt** – also
rund 1,20 € pro Container und Jahr. Bei Variante B kommt alle vier bis sechs
Jahre ein Batteriewechsel für etwa 20–26 € dazu, bei Variante A jährlich rund
10 €.

Der Server kostet zusätzlich: entweder Supabase und Vercel im kostenlosen Tarif
(für diese Datenmengen ausreichend), oder ein eigener kleiner Server für rund
5–10 € im Monat ([docker.md](docker.md)).

### Grobe Wirtschaftlichkeit

Eine vergebliche Anfahrt zu einem noch leeren Container kostet Fahrzeug- und
Personalzeit – realistisch 15 bis 30 € je Fahrt. Wenn ein Sensor pro Jahr auch
nur fünf solcher Fahrten erspart, hat er sich in Variante A nach etwas mehr als
einem Jahr bezahlt gemacht. Dazu kommt, was sich schlecht beziffern lässt: kein
überquellender Container mehr, der Ärger mit der Gemeinde macht.

---

## Bestellhinweise

* **Platine und Sensor** kommen bei AliExpress und DFRobot direkt aus China –
  zwei bis vier Wochen Lieferzeit einplanen, und bei Bestellungen über 150 €
  fällt Einfuhrumsatzsteuer an. Amazon.de und Tindie sind teurer, dafür in
  Tagen da. Für den Pilot: die schnelle Quelle. Für die Serie: rechtzeitig
  direkt bestellen.
* **SIM-Karten** bei 1NCE gleich in der benötigten Stückzahl ordern; sie werden
  einzeln im Portal aktiviert.
* **Die Antenne ist das Teil, an dem nicht gespart werden sollte** – siehe
  [hardware.md, Abschnitt 4](hardware.md#4-der-wichtigste-punkt-die-antenne).
  Eine 3-€-Antenne im Blechcontainer ist der teuerste Fehler des ganzen
  Projekts.
* **Immer ein bis zwei Ersatzboxen** mitbestellen. Eine defekte Box wird nach
  dem Anlernprozess in fünf Minuten getauscht, aber nur, wenn eine da ist.
