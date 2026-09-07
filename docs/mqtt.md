# Sensoren über MQTT anbinden

Für Geräte, die ihre Messwerte an einen eigenen Broker schicken statt an die
Wolke des Herstellers – Milesight EM400-MUD und EM400-TLD, Dragino DDS75.
Das ist „Weg B“ aus [sensor-entscheidung.md](sensor-entscheidung.md).

```
  Sensor ──MQTT+TLS──▶ Broker ──Brücke──▶ POST /api/ingest/webhook ──▶ Datenbank
  (8883)               mosquitto          docker/bruecke              Messung,
                                                                      Füllstand,
                                                                      Alarm
```

Die Brücke ist der Teil, den man leicht übersieht: **ein Broker allein tut
nichts.** Er nimmt Nachrichten entgegen und gibt sie an Abonnenten weiter –
gibt es keinen Abonnenten, verfallen sie. Deshalb läuft neben dem Broker der
Dienst `bruecke`, der mithört und jede Meldung an denselben Annahmeweg
weiterreicht, den auch die Herstellerwolke benutzt.

Dadurch gibt es Dekoder, Gerätesuche, Leerungserkennung, Prognose und Alarme
**nur einmal**. Die Brücke rechnet nichts; sie trägt.

---

## 1. Das Konto der Sensoren

Alle Sensoren melden sich mit **einem** Konto: Benutzername `sensor`, Passwort
aus `MQTT_SENSOR_PASSWORT` in der `.env`. Die Oberfläche zeigt beides beim
Aufnehmen eines Geräts an – wer draußen am Container steht, braucht dafür
keine Sitzung auf dem Server.

Einmalig einrichten – Passwort und Geräteausweise gehören zusammen, ohne
beides bleibt Port 8883 zu:

```bash
openssl rand -hex 24          # Wert nach MQTT_SENSOR_PASSWORT in die .env
sh scripts/geraete-zertifikate.sh          # legt die Geräte-CA an
docker compose restart mqtt
```

Den Ausweis je Gerät stellt derselbe Befehl mit der Seriennummer aus – siehe
Abschnitt 3.

`node scripts/schluessel-erzeugen.mjs` erzeugt `MQTT_SENSOR_PASSWORT` bei
einer frischen Installation gleich mit.

**Warum ein gemeinsames Konto und nicht eines je Gerät.** Ein eigenes Konto
schützt nur, wenn es auch eigene Rechte hat. Die Rechte sind aber für jeden
Sensor dieselben: schreiben ja, lesen nein (Abschnitt 3). Ein Konto je Gerät
wäre damit Buchhaltung, kein Schutz – und es brächte einen Arbeitsschritt auf
der Kommandozeile in einen Vorgang, der sonst vollständig in der Oberfläche
stattfindet.

Beim **Client-Zertifikat** liegt der Fall anders: dort hat jedes Gerät ein
eigenes, denn nur damit lässt sich ein einzelnes aussperren (Abschnitt 3).

Wer trotzdem eines je Gerät will – etwa um ein einzelnes gestohlenes Gerät
abschalten zu können, ohne alle anderen neu einzustellen –, trägt es in
`MQTT_GERAETE` ein, Form `name:passwort`, mehrere durch Komma getrennt:

```
MQTT_GERAETE=em400-6746D3486383:<Passwort>,em400-6746D3486384:<Passwort>
```

Diese Konten bekommen dieselben Rechte wie `sensor`. Die Benutzerliste wird
bei jedem Start aus der `.env` neu erzeugt (`docker/mqtt/start.sh`);
bestehende Verbindungen stört das nicht länger als eine Sekunde.

---

## 2. Das Thema – und warum es egal ist

Die Brücke abonniert **`#`**, also alles. Grund: nicht jede Firmware lässt das
Uplink-Thema einstellen. In der ToolBox-App der EM400-Reihe steht unter
*Application Mode → MQTT* je nach Stand nur Broker, Port, Client ID,
Zugangsdaten und TLS – kein Themenfeld. Ein Gerät sendet dann auf einem festen,
undokumentierten Thema.

Wer darauf baut, dass es `sensoren/…` heißt, bekommt eine Anlage, die
schweigt, ohne dass jemand sieht warum: der Broker verwirft nicht abonnierte
Meldungen still.

Bietet die App doch ein Themenfeld, ist

```
sensoren/<Seriennummer>/up
```

die saubere Wahl – dann steht in den Protokollen, welches Gerät gemeldet hat,
und `MQTT_THEMA=sensoren/#` grenzt die Brücke wieder ein.

**Wer das Gerät ist, entscheidet die Nutzlast**, nicht das Thema. Nur wenn eine
Meldung gar keine Kennung nennt *und* das Thema die Form `sensoren/<SN>/…` hat,
gilt der zweite Abschnitt als Seriennummer. Sonst bleibt sie unbekannt – und
die Antwort des Annahmewegs nennt im Feld `gesucht`, was tatsächlich ankam.

---

## 3. Verschlüsselung

| Port | Wofür | Erreichbar |
|---|---|---|
| 8883 | Geräte aus dem Mobilfunknetz | aus dem Internet |
| 1883 | Brücke, Fehlersuche auf dem Server | nur 127.0.0.1 und Docker-Netz |
| 9001 | WebSockets, Fehlersuche | nur 127.0.0.1 (SSH-Tunnel) |

**1883 überträgt im Klartext.** Ein Gerät, das darüber hereinkommt, schickt
Benutzername und Passwort offen durchs Netz. Deshalb ist der Port nicht mehr
nach außen freigegeben, und Geräte gehören auf 8883.

Der verschlüsselte Zugang benutzt dasselbe Let's-Encrypt-Zertifikat wie die
Web-Oberfläche. Welche Dateien ins Gerät gehören, steht weiter unten unter
„Drei Dateien, zwei Richtungen“.

**Themenrechte.** Ein Sensorkonto darf **schreiben, aber nicht lesen**. Die
Brücke darf umgekehrt nur lesen. Wer die Zugangsdaten aus einem Gehäuse fischt,
kann damit also keine fremden Füllstände beobachten – das ist der Teil, der
wirklich schützt.

Das Schreibrecht ist bewusst nicht auf `sensoren/#` begrenzt: siehe Abschnitt 2,
sonst verlöre ein Gerät ohne einstellbares Thema jede Meldung. Was das kostet,
ist überschaubar – zuhören tut nur die Brücke, und sie prüft jedes Gerät gegen
die Datenbank. Die Rechtedatei entsteht bei jedem Start neu
(`docker/mqtt/start.sh`).

### Drei Dateien, zwei Richtungen

Auf 8883 weisen sich **beide Seiten** aus. Das ist keine Vorliebe, sondern
eine Vorgabe des Geräts: die ToolBox-App verlangt bei eingeschaltetem TLS
zwingend ein Client-Zertifikat („This field is required"). Wenn ohnehin eines
her muss, soll es auch geprüft werden – der Broker steht deshalb auf
`require_certificate true`.

| Datei in der App | Wer weist sich damit aus | Woher |
|---|---|---|
| **CA File** | der Server gegenüber dem Gerät | `https://altkleider.tech/zertifikate/isrg-root.pem` |
| **Client Certificate** | dieses eine Gerät gegenüber dem Server | Oberfläche, *Sensoren → Einstellungen* |
| **Client Key** | dasselbe, der geheime Teil | ebenda |

Alle drei stehen in der Oberfläche zum Antippen bereit.

**CA File.** Der Sensor hat keinen Zertifikatsspeicher wie ein Browser; er
will die Datei, gegen die er prüft. Darin stehen **ISRG Root X1 und X2**, die
selbstsignierten Wurzeln von Let's Encrypt. Nicht die Datei aus
`docker/gateway/zertifikate/` nehmen: die enthält Zwischenzertifikate, die
alle drei Monate wechseln – das Gerät müsste dann jedes Mal neu eingestellt
werden. Die Wurzeln halten Jahre.

**Client Certificate und Key** stammen aus einer eigenen kleinen CA –
**je Gerät ein eigener Ausweis**:

```bash
sh scripts/geraete-zertifikate.sh 6749F17756790021
sh scripts/geraete-zertifikate.sh --alle     # für alle Sensoren der Datenbank
```

Sie laufen **nicht ab**: als notAfter steht der in RFC 5280 dafür vorgesehene
Wert `99991231235959Z`. Ein Ablaufdatum hieße, an einem Stichtag zu jedem
Container zu fahren und per NFC neu einzustellen – und wer das versäumt, merkt
es daran, dass die Meldungen aufhören, ohne dass irgendwo ein Fehler steht.
Geprüft werden diese Daten vom Broker, der eine richtige Uhr hat.

Die Dateien liegen bewusst **nicht** unter `public/`, sondern hinter der
Anmeldung (`/intern/sensoren/<id>/zertifikat`): der Schlüssel ist ein
Zugangsmittel, kein öffentliches Dokument. Der Schlüssel der CA selbst liegt
in `docker/mqtt/geraete-ca/` und wird in keinen Container eingehängt – wer ihn
hat, stellt sich beliebige Geräteausweise aus. Genau deshalb stellt die
Oberfläche keine Ausweise aus, sondern zeigt nur den Befehl dafür an.

### Ein einzelnes Gerät aussperren

Wird ein Sensor gestohlen oder verschwindet er:

```bash
sh scripts/geraet-sperren.sh 6749F17756790021
docker compose restart mqtt
```

Danach lässt der Broker genau dieses eine Gerät nicht mehr herein – alle
anderen melden weiter, und niemand muss zu einem Container fahren. Ausweis und
Schlüssel wandern in den Tresor, die Seriennummer in die Sperrliste
(`crl.pem`, eingebunden über `crlfile`).

Taucht das Gerät wieder auf, bekommt es einfach einen neuen Ausweis; die alte
Sperre bleibt bestehen und trifft nur den alten.

> **Die Sperrliste hat selbst ein Ablaufdatum**, und eine abgelaufene lässt den
> Broker **jedes** Gerät ablehnen. Deshalb wird sie mit hundert Jahren
> Laufzeit ausgestellt (`default_crl_days` in
> `docker/mqtt/geraete-ca/openssl.cnf`). Wer daran dreht, baut sich einen
> Stichtag ein, an dem die ganze Anlage schweigt.

Nach einer Zertifikatserneuerung (certbot, alle drei Monate):

```bash
docker compose restart mqtt
```

Der Broker liest das Zertifikat nur beim Start. Ohne den Neustart läuft er mit
dem alten weiter, bis es abläuft – dann lehnt der Sensor die Verbindung ab.
Das ist der wahrscheinlichste Grund, wenn nach Monaten plötzlich nichts mehr
ankommt.

---

## 4. Einstellungen im Sensor (Milesight EM400-MUD, NB-IoT)

**Alle Werte stehen in der Oberfläche**: nach dem Aufnehmen des Geräts direkt
auf dem Bildschirm, später jederzeit unter *Sensoren → Einstellungen*. Dort
lässt sich jeder Wert antippen und kopieren, und die CA-Datei herunterladen –
ein 48-stelliges Passwort schreibt niemand ab. Die Tabelle hier ist nur die
Übersicht.

ToolBox öffnen, Handy an das Gehäuse halten, dann *Device → Application Mode*.
Zum Schluss **Write** drücken – ohne das bleibt alles beim Alten.

| Feld in der App | Wert |
|---|---|
| Application Mode | **MQTT** |
| Broker Address | `altkleider.tech` |
| Port | `8883` |
| Client ID | Seriennummer (die App füllt das meist selbst) |
| User Credentials | ein |
| UserName | `sensor` |
| Password | aus `MQTT_SENSOR_PASSWORT` – die Oberfläche zeigt es an |
| TLS | ein |
| TLS Version | TLS v1.2 |
| CA File | `isrg-root.pem` |
| Client Certificate | `<Seriennummer>.pem` |
| Client Key | `<Seriennummer>-key.pem` |
| Uplink Topic | `sensoren/<SN>/up`, falls es das Feld gibt – sonst egal |
| QoS | 1, falls einstellbar |

Unter *Device → General*:

| Feld in der App | Wert |
|---|---|
| Reporting Interval | 360 min |
| Cumulative Numbers | **aus** |
| Data Storage / Retransmission | ein |

**Cumulative Numbers ausschalten.** Aus dem Handbuch:

> Cumulative Numbers: Store this number of periodic packets to report
> together. […] the device supports to report sensor data according to
> reporting interval\*cumulative numbers (30 mins\*12 by default)

Das Gerät misst also im Reporting Interval, sammelt und sendet erst, wenn es
so viele Messungen beisammen hat. Werkseinstellung 30 min × 12 = alle sechs
Stunden. Mit 360 min × 12 wären es **alle drei Tage** – die Anwendung hielte
den Sensor längst für tot (`max_stille_stunden`, Vorgabe 24) und beim
Kalibrieren wartete man vergeblich.

Aus geschaltet gilt schlicht: alle 360 Minuten eine Messung, sofort gesendet.
Das kostet auch keine Batterie – vier Funkstrecken am Tag sind genau so viele
wie in der Werkseinstellung, nur mit einer Messung statt zwölf.

**Alle drei Dateien sind Pflicht.** Lässt man Client Certificate oder Key
leer, weigert sich die App: „Please write the Client Certificate first."
Und ohne gültiges Zertifikat lässt der Broker die Verbindung gar nicht erst
zustande kommen – der Sensor meldet dann nur „connection lost", ohne Grund.

**Für einen Container, der stillsteht**, lohnt ein Blick auf *Device →
General*: „Positioning Settings" und „Motion Report Interval" melden Bewegung
und kosten Batterie, ohne dass jemand etwas davon hätte. „Tilt & Distance
Switch" dagegen ruhig anlassen – die Lage steht in jeder Meldung und verrät
ein umgeworfenes oder aufgebrochenes Gerät.

Die APN-Einstellungen der SIM stehen im Blatt des Mobilfunkanbieters (Reiter
*Network*) und haben mit MQTT nichts zu tun.

### Reiter „Calibration"

| Feld | Wert | Warum |
|---|---|---|
| Distance | ein | die Messung selbst |
| Calibration Value | **0.000** | der Versatz gehört in die Anwendung, nicht ins Gerät |
| Measure Outlier Calibration | **ein** | siehe unten |

**Calibration Value bleibt 0.** Das Feld addiert einen festen Wert auf jede
Messung – genau das tut das Feld *Montageversatz* beim Aufnehmen des Geräts
auch. Beides zu setzen rechnet den Versatz zweimal ein. Die Anwendung ist der
bessere Ort dafür: dort steht der Wert sichtbar in der Geräteliste und lässt
sich ändern, ohne zum Container zu fahren.

**Measure Outlier Calibration ein.** Das Handbuch ist hier eindeutig:

> When the device distance value exceeds the outlier range comparing to the
> last value, the device will measure the distance once again.

Der Filter **verwirft nichts, er misst noch einmal**. Damit fängt er einzelne
Fehlechos ab – über weichem, unebenem Stoff kommen die vor –, ohne eine echte
Leerung zu verschlucken: die bestätigt sich bei der zweiten Messung und wird
gemeldet.

Wichtig ist die Unterscheidung, weil ein verwerfender Filter tatsächlich
schädlich wäre: die Leerungserkennung springt an, wenn der Füllstand um
mindestens 40 Prozentpunkte auf unter 30 % fällt (`leerung_erkennung_diff`) –
also genau bei dem großen Sprung, den ein Ausreißerfilter verdächtig fände.
Ein erneutes Messen ist etwas anderes als ein Verwerfen.

### Reiter „Threshold"

**Aus lassen** – den Schalter *Distance* auf diesem Reiter abschalten, beide
Felder leer.

Der Reiter lässt das Gerät sofort melden, wenn der Abstand eine Schwelle
über- oder unterschreitet, und misst dafür alle 30 Minuten statt alle 360
(*Collecting Interval*). Drei Gründe, das nicht zu tun:

**Die Schwellen stehen schon woanders.** Die Anwendung warnt bei 75 % und
schlägt bei 90 % Alarm (`schwelle_warnung`, `schwelle_voll`) – in Prozent,
gerechnet aus Leer- und Vollwert des Containers. Das Gerät kennt nur Meter
und weiß nichts von dieser Kalibrierung. Man müsste von Hand umrechnen, und
beim ersten Nachkalibrieren oder Umsetzen des Sensors stimmte der Wert im
Gerät still nicht mehr. Dieselbe Falle wie beim Calibration Value: Wissen,
das an zwei Stellen liegt, veraltet an einer davon.

**Zwölfmal so viele Messungen.** Alle 30 statt alle 360 Minuten – das geht
auf die Batterie, für einen Container, der auf einer Tourenplanung steht.

**Alarmmeldungen liest der Dekoder im HEX-Betrieb nicht.** Milesight schickt
sie auf einem eigenen Kanal (`83 82` statt `03 82`); `lib/dekoder/milesight.ts`
bricht dort bewusst ab, statt zu raten. Nachgestellt:

| Nutzlast | Antwort |
|---|---|
| `01 75 60 03 82 2C 03` (normal, HEX) | `{"gespeichert":true,"abstand_mm":812}` |
| `01 75 60 83 82 2C 03 01` (Alarm, HEX) | `{"gespeichert":false,"grund":"kein Abstand"}` |
| dasselbe als JSON | `{"gespeichert":true,"abstand_mm":812}` |

Im empfohlenen JSON-Betrieb ginge es also – aber es wäre eine unnötige
Abhängigkeit vom Nutzlastformat.

**Wenn doch schnelle Alarme gebraucht werden** – etwa an einem Standort, der
regelmäßig überläuft –, ist der Weg: den Dekoder um den Alarmkanal ergänzen
und die Schwelle nur für dieses eine Gerät setzen. Dann aber bewusst, mit dem
Wissen, dass sie beim Nachkalibrieren mitgeführt werden muss.

---

**„Current Value: 65533 m"** ist übrigens kein Messwert, sondern die
Fehlerkennung des Sensors (0xFFFD) – er sieht gerade nichts im Messbereich.
Auf dem Schreibtisch ist das normal. Im Betrieb steht er als ungültig in der
Datenbank und erzeugt keinen Füllstand – und kommt er mehrmals hintereinander,
meldet die Anlage **„Nichts im Messbereich“**: dann steht etwas direkt vor dem
Sensor (randvoller Behälter, verdeckte Membran, heruntergefallene Sonde),
siehe [betrieb.md](betrieb.md), Abschnitt 2b.

---

## 5. Gerät in der Anwendung aufnehmen

*Intern → Sensoren → Gerät aufnehmen*

1. Bauart **Milesight EM400-MUD (NB-IoT)**. Messbereich (30–4500 mm) und
   Annahmeweg stellen sich damit selbst ein.
2. **Geräte-ID = Seriennummer (SN)** vom Aufkleber. Unter dieser Nummer meldet
   sich das Gerät.
3. **IMEI** und **ICCID** zusätzlich, wenn zur Hand – der zweite und dritte
   Suchweg.
4. **Montageversatz**: Abstand von der Sensorunterkante zur Deckelinnenseite.
5. Speichern. Es erscheint **kein Geräteschlüssel** – der EM400 braucht keinen.
   Der **Anlerncode** erscheint wie beim Eigenbau und gehört auf den Aufkleber.

Danach weiter wie in [anlernprozess.md](anlernprozess.md), Phase 2: Anlerncode
scannen, Container wählen, Leerwert übernehmen.

Meldungen, die vor dem Anlernen ankamen, sind protokolliert und werden beim
Koppeln rückwirkend zugeordnet – der Leerwert ist oft schon da, bevor jemand
danach fragt.

---

## 6. Prüfen, ob es ankommt

Eine Meldung von Hand einspielen, ohne Gerät:

```bash
docker compose exec mqtt mosquitto_pub \
  -h altkleider.tech -p 8883 --capath /etc/ssl/certs \
  --cert docker/mqtt/geraete/6746D3486383.pem \
  --key docker/mqtt/geraete/6746D3486383-key.pem \
  -u sensor -P "$MQTT_SENSOR_PASSWORT" \
  -t 'sensoren/6746D3486383/up' \
  -m '{"sn":"6746D3486383","data":{"battery":96,"distance":812,"temperature":14.2}}'
```

Und mitlesen, was die Brücke daraus macht:

```bash
docker compose logs -f bruecke
```

| Zeile im Protokoll | Bedeutung |
|---|---|
| `{"ok":true,"gespeichert":true,…}` | angekommen und abgelegt |
| `{"ok":true,"gespeichert":false,…}` | Lebenszeichen ohne Messwert – kein Fehler |
| `abgelehnt (404) … "gesucht":{…}` | Gerät nicht angelernt. `gesucht` nennt die Kennungen aus der Meldung – genau die gehören in die Geräteaufnahme |
| `abgelehnt (401)` | `INGEST_WEBHOOK_TOKEN` stimmt nicht |
| `abgelehnt (503)` | `INGEST_WEBHOOK_TOKEN` ist nicht gesetzt |
| gar nichts, Gerät meldet „connection lost" | Client-Zertifikat fehlt oder passt nicht |
| `Anwendung nicht erreichbar` | die Anwendung antwortet nicht – `docker compose logs app` |

Wer beim Broker selbst mitlesen will – das geht nur mit dem Konto der Brücke,
Sensorkonten haben kein Leserecht:

```bash
docker compose exec mqtt mosquitto_sub -h 127.0.0.1 -p 1883 \
  -u "$MQTT_BENUTZER" -P "$MQTT_PASSWORT" -t 'sensoren/#' -v
```

---

## 7. Wenn nichts ankommt

Der Weg hat vier Abschnitte. Sie lassen sich einzeln prüfen, von hinten nach
vorne:

| Frage | Prüfung |
|---|---|
| Läuft die Brücke? | `docker compose ps bruecke` – und im Protokoll muss „Abonniert“ stehen |
| Kommt beim Broker etwas an? | `mosquitto_sub` auf `sensoren/#` (oben) |
| Kommt das Gerät bis zum Broker? | `docker compose logs mqtt \| grep -i "new client"` – meldet sich sein Konto? |
| Hat das Gerät Netz? | Signalstärke in der ToolBox-App, SIM freigeschaltet? |

Ein häufiger Fall: Das Gerät verbindet sich, aber das Thema passt nicht zu
`MQTT_THEMA`. Dann steht im Brokerprotokoll eine Verbindung, in der Brücke
aber nichts. `mosquitto_sub -t '#' -v` zeigt, unter welchem Thema es
tatsächlich sendet.
