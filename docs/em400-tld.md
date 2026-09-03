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
| Weg | Gerät → `POST /api/ingest` | Gerät → MQTT-Broker → `POST /api/ingest/webhook` |
| Ausweis | HMAC-SHA256 je Gerät | Benutzer/Passwort je Gerät am Broker, dahinter ein gemeinsamer Schlüssel |
| Erkennung | Geräte-ID | Seriennummer, IMEI oder ICCID |
| Batterie | Volt | Prozent |
| Einrichtung | Firmware flashen | NFC-App |

Der Umweg über den Broker ist keine Umständlichkeit, sondern eine Eigenschaft
des Geräts: es spricht **kein HTTP** (Abschnitt 4). Wer das übersieht, sucht in
der NFC-App nach einem Feld für die Serveradresse und findet keines.

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
einem je Gerät. Wer ihn hat, kann für jedes angelernte Gerät Messwerte
einreichen. Ein Gerät übernehmen kann er damit nicht, und schlimmstenfalls steht
ein falscher Füllstand in der Liste, den die nächste echte Meldung überschreibt.

Diesen Schlüssel kennt allerdings **nicht das Gerät**, sondern nur der Broker
(Abschnitt 4): das Gerät spricht kein HTTP und kann gar keine Kopfzeile setzen.
Er sichert damit nur die kurze Strecke Broker → Anwendung, während sich das
Gerät am Broker mit **eigenem Benutzernamen und Passwort** ausweist. Unterm
Strich ist das besser als ursprünglich geplant – jedes Gerät hat wieder sein
eigenes Geheimnis.

Trotzdem gilt: **die Adresse gehört nicht in Handbücher, und der Schlüssel ist
lang und zufällig.**

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

### Das Gerät kann kein HTTP

**Wichtig, und in einer früheren Fassung dieser Anleitung stand es falsch:** die
NB-IoT-Ausführung des EM400 bietet unter *Application Mode* genau vier
Betriebsarten an – **MQTT, AWS, TCP, UDP**. HTTP ist nicht darunter, und
folglich gibt es auch **kein Feld für eine Serveradresse mit Pfad und keines
für eine eigene Kopfzeile**. Wer danach sucht, sucht vergeblich.

Damit lässt sich `/api/ingest/webhook` **nicht unmittelbar vom Gerät aus
erreichen**. Zwischen Gerät und Anwendung gehört ein Stück Vermittlung – ein
MQTT-Broker oder ein Empfänger für TCP/UDP –, das die Meldung entgegennimmt und
als HTTP-Aufruf weiterreicht.

### Was die vier Betriebsarten für uns bedeuten

| Modus | Was das Gerät tut | Was wir dafür brauchen |
|---|---|---|
| **MQTT** | veröffentlicht auf einem Broker, mit Benutzer/Passwort je Gerät und TLS | einen Broker, der die Nachricht an unseren Webhook weiterreicht |
| AWS | dasselbe, aber fest gegen AWS IoT Core, mit Zertifikat je Gerät | ein AWS-Konto samt IoT-Core-Regel |
| TCP | roher Datenstrom an Host:Port | einen dauerhaft laufenden Empfänger mit offenem Port |
| UDP | einzelne Datagramme an Host:Port | dasselbe, ohne Zustellgarantie |

**Empfohlen wird MQTT.** Nicht nur, weil es die Betriebsart ist, die Milesight
am besten unterstützt, sondern wegen eines Nebeneffekts, der die Sache
*sicherer* macht als der ursprüngliche Entwurf: MQTT kennt **Benutzername und
Passwort je Gerät**. Damit wird aus dem gemeinsamen Schlüssel, dessen Schwäche
in Abschnitt 2 offen dasteht, wieder ein Geheimnis je Gerät – so, wie es beim
Eigenbau ohnehin ist. Der gemeinsame Schlüssel sichert dann nur noch die
kurze, nicht öffentlich bekannte Strecke Broker → Anwendung.

TCP und UDP sind nicht falsch, verlangen aber einen Dienst, der Tag und Nacht
läuft und einen Port ins Internet offen hat. Beim Betrieb auf Vercel und
Supabase gibt es keinen solchen Prozess – das wäre ein Bruch in der
Architektur, denselben, den [sensor-entscheidung.md](sensor-entscheidung.md)
in Abschnitt 5 unter Weg B beschreibt.

### Warum der Broker nicht bei Vercel laufen kann

Die naheliegende Frage zuerst, weil sie sich sonst später stellt: **Nein, ein
MQTT-Broker lässt sich nicht auf Vercel betreiben.** Drei Gründe, jeder für
sich ausreichend:

1. Vercel führt Funktionen aus, die für die Dauer einer Anfrage leben. Ein
   Broker muss Tag und Nacht laufen und dabei offene Verbindungen halten.
2. Nach außen gibt Vercel ausschließlich HTTPS auf Port 443. MQTT braucht
   einen eigenen TCP-Port (1883 bzw. 8883).
3. Selbst MQTT über WebSockets – das über 443 ginge – hilft nicht: der EM400
   spricht rohes MQTT über TCP, nicht über WebSockets.

Dasselbe gilt für TCP und UDP aus der Betriebsartenliste. **Irgendwo muss ein
Prozess dauerhaft laufen.** Die Frage ist nur, wo.

Zwei Wege führen zum Ziel. Die Anwendung selbst bleibt in beiden Fällen
unverändert bei Vercel – sie nimmt die Messung über `/api/ingest/webhook`
entgegen und merkt nicht, woher sie kommt.

| | Broker im eigenen Haus | Gemieteter Broker |
|---|---|---|
| Was läuft wo | Mosquitto + Brücke auf einem Rechner bei Ihnen | beim Anbieter; er ruft den Webhook auf |
| Eigener Server nötig | ja, dauerhaft erreichbar | nein |
| Erreichbarkeit | feste Adresse oder DynDNS, Portfreigabe | erledigt der Anbieter |
| Zertifikat | selbst besorgen (Let's Encrypt) | bringt der Anbieter mit |
| Abhängigkeit von Dritten | keine | eine mehr |
| Laufende Kosten | Strom und ein Rechner | je nach Tarif, für wenige Geräte oft kostenlos |

Beides ist vorbereitet. Der eigene Broker steckt im `docker-compose.yml`
(unten); für den gemieteten muss an der Anwendung **nichts** geändert werden –
der Annahmeweg versteht die übliche Weiterleitungsvorlage bereits, siehe
[Gemieteter Broker](#gemieteter-broker-ohne-eigenen-server).

---

### Gemieteter Broker (ohne eigenen Server)

Der Anbieter betreibt den Broker; eine Regel dort ruft bei jeder Nachricht
unseren Webhook auf. Damit läuft alles außer dem Broker bei Vercel, und es gibt
keinen Rechner im Haus, der nachts laufen muss.

Anbieter mit einer solchen Weiterleitung gibt es mehrere; **EMQX Cloud
Serverless** ist einer davon und rechnet nach Verbrauch ab – bei wenigen
Geräten bleibt es im kostenlosen Rahmen, und ein Ausgabelimit von 0 lässt sich
setzen. **Die Tarife ändern sich; bitte vor dem Verlassen auf sie nachsehen.**

Im Broker einzurichten:

| | |
|---|---|
| Zugang je Gerät | Benutzername = Seriennummer, eigenes Passwort |
| Thema | `altkleider/<Seriennummer>/up` |
| Regel / Webhook | URL `https://<ihre-adresse>/api/ingest/webhook`, Methode POST |
| Kopfzeile | `X-Ingest-Schluessel: <INGEST_WEBHOOK_TOKEN>` |

**Die Kopfzeile setzt hier der Broker**, nicht das Gerät – das ist der Grund,
warum der gemeinsame Schlüssel aus Abschnitt 2 überhaupt noch eine Rolle
spielt. Erlaubt der Anbieter keine eigene Kopfzeile, taugt er für diesen Weg
nicht.

Die Nutzlastvorlage kann bleiben, wie sie ab Werk ist. Üblich ist

```json
{ "topic": "${topic}", "payload": ${payload}, "clientid": "${clientid}", "qos": ${qos} }
```

und genau damit kommt der Annahmeweg zurecht: `payload` wird als Objekt **und**
als Zeichenkette gelesen (auch als Bytefolge im HEX-Betrieb), und fehlt in der
Nutzlast die Seriennummer, holt der Dekoder sie aus `topic` oder `clientid`.
Was das Gerät selbst über sich sagt, hat dabei immer Vorrang vor dem Umschlag
des Brokers – sonst schickte ein Tippfehler im Thema die Messung
stillschweigend an den falschen Container.

Achten Sie darauf, die Zugriffsregeln des Anbieters so zu setzen, dass **jedes
Gerät nur sein eigenes Thema beschreiben darf**. Ohne das könnte Gerät A
Messungen im Namen von Gerät B einreichen; die Meldung sähe völlig richtig aus,
und der Container wäre angeblich leer. Beim eigenen Broker erledigt das
`docker/mosquitto/acl`.

---

### Broker im eigenen Haus

Das Projekt bringt beides mit: den Broker (Mosquitto) und die Brücke, die vom
Broker zu `/api/ingest/webhook` weiterreicht. Beide stecken im vorhandenen
`docker-compose.yml` unter dem Profil `mqtt` und laufen nur, wenn man sie
ausdrücklich startet – wer nur Eigenbau-Sensoren betreibt, braucht sie nicht.

**Der Broker kann im eigenen Haus stehen, auch wenn die Anwendung bei Vercel
liegt.** Die Brücke ruft nur hinaus; einen offenen Port braucht sie nicht. Nach
außen offen ist allein der Broker, damit die Sensoren ihn erreichen.

```
Sensor ──MQTT──▶ Mosquitto ──▶ Brücke ──HTTPS──▶ /api/ingest/webhook
   \_ Benutzer + Passwort je Gerät      \_ X-Ingest-Schluessel
```

```bash
# 1. Schlüssel für den Annahmeweg setzen (Abschnitt 2), dann Broker starten
docker compose --profile mqtt up -d mosquitto

# 2. Die Brücke am Broker anmelden – gibt ihr Passwort aus
./scripts/mqtt-geraet-anlegen.sh bruecke
#    -> MQTT_BRUECKE_PASSWORT=... in die .env eintragen

# 3. Brücke starten
docker compose --profile mqtt up -d mqtt-bruecke
docker compose logs -f mqtt-bruecke

# 4. Für jeden Sensor einen Zugang – gibt alle Werte für die NFC-App aus
./scripts/mqtt-geraet-anlegen.sh 6746D3486383
```

Der **Benutzername ist die Seriennummer**, und daran hängt die Zugriffsregel
`pattern write altkleider/%u/up` (`docker/mosquitto/acl`): jedes Gerät darf
ausschließlich unter seinem eigenen Namen veröffentlichen. Ohne diese Regel
könnte Gerät A Messungen im Namen von Gerät B einreichen – die Meldung sähe
völlig richtig aus, und der Container wäre angeblich leer. Die Brücke wiederum
darf mitlesen, aber **nicht** veröffentlichen: sie ist Zuhörer, nicht
Teilnehmer.

> **Verschlüsselung.** Ab Werk lauscht der Broker auf 1883, unverschlüsselt.
> Darauf wandert das Gerätepasswort im Klartext über das Mobilfunknetz – für
> einen Versuch am Schreibtisch vertretbar, für den Dauerbetrieb nicht. Sobald
> ein Zertifikat vorliegt (Let's Encrypt für den Namen, unter dem der Broker
> erreichbar ist), wird aus `docker/mosquitto/conf.d/tls.conf.beispiel` eine
> `tls.conf`, und Port 1883 gehört hinter die Hausfirewall. Ein selbst
> ausgestelltes Zertifikat lehnt der EM400 ab.

### Einstellungen im Gerät (MQTT)

Die Werte gibt `./scripts/mqtt-geraet-anlegen.sh <Seriennummer>` aus – das
Passwort **nur ein einziges Mal**.

| Feld in der ToolBox | Wert |
|---|---|
| Application Mode | MQTT |
| Broker Address | Adresse Ihres Brokers (**ohne** `/api/...`-Pfad – MQTT kennt keine Pfade) |
| Broker Port | 8883 mit TLS, 1883 ohne |
| Client ID | die Seriennummer des Geräts |
| Topic | ein fester Pfad je Gerät, z. B. `altkleider/<Seriennummer>` |
| User Credentials | **ein** – Benutzername und Passwort je Gerät |
| TLS | **ein**, sobald der Broker es kann |
| Reporting Interval | 360 min (viermal am Tag) |
| Data Storage / Retransmission | ein – Meldungen aus Funklöchern kommen nach |

Ein Feld für das Nutzlastformat gibt es je nach Firmwarestand gar nicht; die
NB-IoT-Reihe meldet ab Werk JSON. Falls Ihre Fassung die Wahl lässt, ist beides
recht – der Dekoder liest JSON und HEX (Abschnitt 5).

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

### Wenn nichts ankommt: die Kette von hinten aufrollen

Vier Glieder, vier Prüfungen. Wer von hinten anfängt, findet den Bruch mit
wenigen Handgriffen statt mit Raten.

| Prüfung | Befund |
|---|---|
| `curl` wie oben | geht das nicht, liegt es an der Anwendung, nicht am Funk |
| `docker compose logs -f mqtt-bruecke` | zeigt jede weitergereichte Meldung samt Antwort. Steht dort nichts, kommt beim Broker nichts an |
| `mosquitto_sub -h <broker> -u bruecke -P <pw> -t 'altkleider/#' -v` | zeigt mit, was die Geräte veröffentlichen |
| `docker compose logs -f mosquitto` | zeigt abgewiesene Anmeldungen – falsches Passwort, unbekannter Benutzer |

Die häufigste Ursache für „der Broker sieht nichts": das Gerät veröffentlicht
auf einem anderen Thema, als die Zugriffsregel erlaubt. Der Broker verwirft das
**still** – MQTT sieht für eine abgewiesene Veröffentlichung keine Rückmeldung
an den Absender vor. Im Protokoll des Brokers steht es trotzdem.

Zweithäufigste Ursache: Seriennummer in der Geräteaufnahme und Benutzername am
Broker stimmen nicht überein. Dann kommt die Meldung an und der Annahmeweg
antwortet mit `404` samt der gesuchten Kennungen – im Protokoll der Brücke
nachzulesen.

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
