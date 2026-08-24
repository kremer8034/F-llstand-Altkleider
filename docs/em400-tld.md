# Milesight EM400-TLD (NB-IoT) anbinden

Der EM400-TLD ist ein fertiges Füllstandsgerät: ToF-Laser, zwei tauschbare
Lithium-Zellen, NB-IoT, per NFC am Handy eingestellt. Nichts löten, nichts
flashen. Was er dafür nicht kann, ist unser Signaturverfahren – er kennt es
nicht und lässt sich nicht dazu bringen, es zu lernen.

Deshalb gibt es jetzt **zwei Annahmewege** nebeneinander. Die Rechnung
dahinter – Füllstand, Leerungserkennung, Prognose, Alarme – ist in beiden
Fällen dieselbe. Sie hängt an der Messung, nicht daran, wie sie hereinkam.

| | Eigenbau | EM400-TLD |
|---|---|---|
| Adresse | `POST /api/ingest` | `POST /api/ingest/webhook` |
| Ausweis | HMAC-SHA256 je Gerät | gemeinsamer Schlüssel in der Kopfzeile |
| Erkennung | Geräte-ID | Seriennummer, IMEI oder ICCID |
| Batterie | Volt | Prozent |
| Einrichtung | Firmware flashen | NFC-App |

---

## 1. Vorher lesen: die Reichweite

Der EM400-TLD misst laut Datenblatt **50 mm bis 2 m**. Die Anforderung aus
[hardware.md](hardware.md) lautet **0,3–2,5 m** – die Innenhöhe eines
Altkleidercontainers.

Das ist kein Formfehler, sondern der Punkt, an dem die Sache scheitern kann:
Ist der Container innen höher als zwei Meter, meldet der Sensor **im leeren
Zustand keinen Wert**. Genau dieser Wert ist aber der Leerwert, aus dem sich
alle Füllstände berechnen. Ohne ihn zeigt die Anwendung „kein Messwert", bis
der Container halb voll ist.

**Vor der Bestellung an einem echten Container nachmessen**: Deckelinnenseite
bis Boden. Bleibt der Wert unter 2 m, passt der TLD. Liegt er darüber, ist der
**EM400-MUD** (Ultraschall, 0,03–4,5 m) das richtige Gerät derselben Reihe –
die Anbindung ist identisch, es ändert sich nur die Bauart beim Aufnehmen.

Der Messbereich lässt sich beim Aufnehmen des Geräts ändern; die 2000 mm sind
eine Vorgabe, keine Sperre. Ihn hochzusetzen macht das Gerät allerdings nicht
weitsichtiger – es lässt nur Werte gelten, die es ohnehin nicht liefert.

---

## 2. Einen Schlüssel für den Annahmeweg erzeugen

Der zweite Annahmeweg weist sich mit einem gemeinsamen Schlüssel aus, nicht mit
einem je Gerät. Das ist schwächer, und das soll hier so dastehen: wer ihn hat,
kann für jedes angelernte Gerät Messwerte einreichen. Ein Gerät übernehmen kann
er damit nicht, und schlimmstenfalls steht ein falscher Füllstand in der Liste,
den die nächste echte Meldung überschreibt.

Mehr gibt die Sache nicht her, solange das Gerät vom Hersteller kommt: es kann
nur eine feste Kopfzeile mitschicken. Deshalb gilt: **die Adresse gehört nicht
in Handbücher, und der Schlüssel ist lang und zufällig.**

```bash
node scripts/schluessel-erzeugen.mjs
```

Der erzeugte Wert kommt in die Umgebung:

```
INGEST_WEBHOOK_TOKEN=<64 Hexzeichen>
```

Bei Vercel unter *Settings → Environment Variables*, im Docker-Betrieb in die
`.env` neben den übrigen Schlüsseln. Ohne gesetzten Wert antwortet der
Annahmeweg mit `503` und nimmt nichts an – ein Vorgabewert wäre hier dasselbe
wie gar keine Prüfung, nur schwerer zu bemerken.

---

## 3. Gerät in der Anwendung aufnehmen

*Sensoren → Gerät aufnehmen*

1. Bauart **Milesight EM400-TLD (NB-IoT)** wählen. Messbereich und Annahmeweg
   stellen sich damit selbst ein.
2. Als **Geräte-ID die Seriennummer (SN)** vom Aufkleber eintragen. Unter
   dieser Nummer meldet sich das Gerät.
3. **IMEI** und **ICCID** zusätzlich eintragen, wenn sie zur Hand sind. Sie
   sind der zweite und dritte Suchweg, falls eine Firmware die Seriennummer
   nicht mitschickt.
4. **Montageversatz**: Abstand von der Sensorunterkante zur Deckelinnenseite.
5. Speichern. Es erscheint **kein Geräteschlüssel** – der EM400 braucht
   keinen. Der **Anlerncode** erscheint wie beim Eigenbau und gehört auf den
   Aufkleber.

---

## 4. Gerät einstellen (NFC)

Mit der App *Milesight ToolBox* (Android/iOS), Handy an das Gehäuse halten.

| Einstellung | Wert |
|---|---|
| Reporting Interval | 360 min (viermal am Tag) |
| Data Storage / Retransmission | ein – Meldungen aus Funklöchern kommen nach |
| Protokoll | HTTP(S) POST, alternativ MQTT über eine Brücke |
| Server | `https://<ihre-adresse>/api/ingest/webhook` |
| Kopfzeile | `X-Ingest-Schluessel: <INGEST_WEBHOOK_TOKEN>` |
| Nutzlastformat | JSON (Werkseinstellung) oder HEX – beides wird gelesen |

Kann die Firmwarefassung keine eigene Kopfzeile setzen, führt der Weg über die
Herstellerwolke, die per Webhook weiterreicht
([sensor-entscheidung.md](sensor-entscheidung.md), Abschnitt 5, Weg C). Der
Annahmeweg hier ist derselbe – die Wolke muss nur dieselbe Kopfzeile setzen.

---

## 5. Was ankommt und wo es landet

Der Dekoder (`lib/dekoder/milesight.ts`) liest beide Formen.

**JSON** – die Werkseinstellung der NB-IoT-Reihe:

```json
{
  "sn": "6746D3486383",
  "imei": "867997030000001",
  "data": { "battery": 96, "distance": 812, "temperature": 14.2, "position": "normal" }
}
```

**HEX** – dieselben Werte als Bytefolge im Milesight-Format Kanal/Typ/Wert:

| Bytes | Bedeutung |
|---|---|
| `01 75 <1>` | Batterie in Prozent |
| `03 82 <2>` | Abstand in mm, kleinstwertiges Byte zuerst |
| `04 67 <2>` | Temperatur in Zehntelgrad, vorzeichenbehaftet |
| `05 00 <1>` | Lage: 0 = normal, sonst schief |

Die genauen Feldnamen der JSON-Form sind zwischen Firmwareständen **nicht
einheitlich**. Deshalb prüft der Dekoder nicht auf einen festen Namen, sondern
auf eine Liste bekannter Schreibweisen (`battery`, `battery_level`,
`batteryLevel`, …) und sucht sie auch eine Ebene tiefer unter `data`. Der
unveränderte Rumpf wandert ohnehin nach `messung.roh` – wenn also etwas fehlt,
lässt sich nachsehen, was tatsächlich ankam, statt zu raten.

Zuordnung der Werte:

| Meldung | Spalte |
|---|---|
| `distance` | `messung.abstand_mm` |
| `battery` | `messung.batterie_prozent` |
| `temperature` | `messung.temperatur_c` |
| `position` | nur `messung.roh` |
| alles Übrige | `messung.roh` |

**Warum Prozent und nicht Volt.** Die Umrechnung wäre eine Erfindung. Der
EM400 kennt seinen Ladezustand aus der Entladekurve zweier Lithium-Zellen;
welche Spannung dahintersteht, sagt er nicht. Eine ausgedachte Spannung in eine
Spalte zu schreiben, die „Volt" heißt, wäre ein Messwert, den nie jemand
gemessen hat – und der Batteriealarm hinge an einer Erfindung. Also zwei
Spalten nebeneinander, und jedes Gerät füllt die, die es kennt. Die Schwelle
für den Alarm steht als Einstellung `batterie_min_prozent` (Vorgabe 20 %).

---

## 6. Prüfen, ob es ankommt

Erste Meldung von Hand nachstellen:

```bash
curl -X POST https://<ihre-adresse>/api/ingest/webhook \
  -H "X-Ingest-Schluessel: $INGEST_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sn":"6746D3486383","data":{"battery":96,"distance":812,"temperature":14.2}}'
```

| Antwort | Bedeutung |
|---|---|
| `{"ok":true,"gespeichert":true}` | angekommen und abgelegt |
| `{"ok":true,"gespeichert":false}` | Lebenszeichen ohne Messwert – kein Fehler |
| `404` mit `gesucht` | Gerät nicht angelernt. Das Feld `gesucht` nennt die Kennungen aus der Meldung – genau die gehören in die Geräteaufnahme |
| `401` | Schlüssel falsch |
| `503` | `INGEST_WEBHOOK_TOKEN` ist nicht gesetzt |

Der Dekoder selbst lässt sich ohne Gerät und ohne Datenbank prüfen:

```bash
npm run test:dekoder
```

---

## 7. Anlernen am Container

Ab hier ist alles wie beim Eigenbau, siehe [anlernprozess.md](anlernprozess.md):
Anlerncode scannen, Container wählen, Leerwert übernehmen. Die Meldungen, die
das Gerät vor dem Anlernen geschickt hat, sind protokolliert und werden beim
Koppeln rückwirkend zugeordnet – der Leerwert ist damit oft schon da, bevor
jemand danach fragt.

Zwei Handgriffe des Eigenbaus entfallen: der Geräteschlüssel muss nicht in die
Firmware, und die Sofortmessung wird nicht per Magnet ausgelöst. Das Gerät
misst beim Einlegen der Zellen von selbst.
