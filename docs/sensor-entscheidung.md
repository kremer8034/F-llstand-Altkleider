# Entscheidungsvorlage: Eigenbau oder Fertiggerät?

Dieses Dokument entscheidet nichts, es bereitet eine Entscheidung vor. Es
beantwortet vier Fragen, die nach dem Entwurf der [Hardware](hardware.md)
aufgekommen sind:

1. Geht der Eigenbau auch mit weniger Teilen?
2. Gibt es fertige Sensoren oder Bausätze, die man komplett bestellen kann?
3. Gibt es das als „System on a Chip", also fertig verbunden in einem Stück?
4. Wird die Anbindung an die Webseite dadurch einfacher – so, dass weniger
   technisches Vorwissen nötig ist?

Am Backend wird dafür nichts geändert. Die Firmware bleibt liegen, wo sie liegt.
Am Ende steht ein Vorschlag für den nächsten Schritt, kein Umbau.

---

## Die Antworten in Kurzform

**1. Weniger Teile im Eigenbau: ja.** Die Stückliste lässt sich von 16 auf 7
Positionen kürzen. Sie wird dadurch aber vor allem *kürzer*, nicht *billiger* –
gelötet, geflasht und in Betrieb genommen werden muss weiterhin, und die
Firmware in `firmware/altkleider-sensor/` ist bis heute nicht ein einziges Mal
übersetzt worden.

**2. Fertige Geräte: ja, mehrere.** Der günstigste taugliche Kandidat kostet
**98,71 €**, kommt in einem Karton, wird per Bluetooth-App am Handy eingestellt
und funkt über NB-IoT und LTE-M. Nichts löten, nichts flashen, keine Werkbank.

**3. „System on a Chip": nicht im Wortsinn.** Ein Ultraschallwandler ist ein
mechanisches Bauteil und eine Antenne ein Stück Metall bestimmter Länge –
beides lässt sich nicht mit dem Rechenwerk in ein Silizium-Gehäuse pressen. Was
gemeint ist, gibt es aber sehr wohl: ein vergossenes Gerät, in dem alles schon
verbunden ist. Die LilyGO-Platine war bereits der halbe Schritt dahin
(Controller, Modem, SIM-Fassung und Akkuhalter auf einer Platine) – nur eben
eine Stufe zu wenig.

**4. Einfachere Anbindung: ja.** Und das ist der eigentliche Gewinn. Der
Anlernprozess verliert genau die beiden Schritte, die technisches Wissen
verlangen: den Geräteschlüssel ins Gerät bekommen und die Kalibrierung per
Magnet auslösen. Die vier Schritte draußen am Container bleiben unverändert.

Alles Weitere ist die Begründung dazu.

---

## 1. Woran ein Sensor hier gemessen wird

Bevor Produkte verglichen werden, gehört festgehalten, was der Anwendungsfall
verlangt. Die Werte stammen aus [hardware.md](hardware.md), sie sind hier nur
zusammengezogen:

| Kriterium | Anforderung | Warum |
|---|---|---|
| Messbereich | 0,3–2,5 m | Innenhöhe eines Altkleidercontainers |
| Blindzone | ≤ 5 cm | der Sensor hängt dicht unter dem Deckel |
| Messprinzip | muss **Textilien** erkennen | Stoff schluckt Schall, siehe Abschnitt 4 |
| **Antenne** | **muss aus dem Blech heraus** | Stahlcontainer = faradayscher Käfig, [hardware.md §4](hardware.md#4-der-wichtigste-punkt-die-antenne) |
| Funk | NB-IoT oder LTE-M | flächendeckend, keine eigene Infrastruktur |
| Batterie | ≥ 4 Jahre bei 4 Meldungen/Tag, frostfest bis −20 °C | Wartungsfreiheit über Jahre |
| Schutzart | IP66 oder besser | Feuchtigkeit und Textilstaub |
| Einrichtung | ohne Lötkolben, ohne Toolchain | neue Anforderung |
| Datenweg | in **unsere** Datenbank, ohne Zwangswolke | siehe Abschnitt 5 |
| Preis | ≤ 150 € je Container | Wirtschaftlichkeit, [einkaufsliste.md](einkaufsliste.md) |

Zwei dieser Zeilen sind Ausschlusskriterien, keine Wünsche: **die Antenne** und
**der Datenweg**. Ein Gerät, das sie nicht erfüllt, scheidet aus, egal wie gut
es sonst ist. Auf die Antenne kommt Abschnitt 3 zurück, auf den Datenweg
Abschnitt 5.

---

## 2. Der Eigenbau, so klein wie er werden kann

Die heutige Stückliste hat 16 Positionen. Neun davon lassen sich streichen.

### Was wegfällt

**Das Batteriepaket der Variante B – fünf Positionen.** Zwei LiSOCl₂-Zellen,
zwei Halter, Schottky-Diode, Goldcap und Ladewiderstand verschwinden, wenn man
bei der 18650-Zelle bleibt. Mit ihnen verschwinden auch die beiden
Sicherheitsregeln aus der [Einkaufsliste](einkaufsliste.md) – „Diode ist nicht
optional" und „vor jedem USB-Anschluss abklemmen" –, und damit der Teil des
Aufbaus, der wirklich schiefgehen kann. Der Preis dafür sind neun bis fünfzehn
Monate Laufzeit statt vier bis sechs Jahren.

**Reed-Kontakt, Magnet, Status-LED und eine Kabelverschraubung – vier
Positionen.** Der Reed-Kontakt existiert nur, um beim Anlernen eine
Sofortmessung auszulösen. Dasselbe erreicht man, indem das Gerät beim
Einschalten ohnehin sofort misst und sendet: Batterie einlegen ist der Auslöser.
Die Rückmeldung übernimmt die LED, die auf der LilyGO-Platine bereits sitzt –
dann braucht der Deckel keinen durchsichtigen Einsatz mehr.

### Was bleiben muss

**Die MOSFET-Beschaltung.** Naheliegend wäre, sie mitzustreichen, aber sie
trägt: der A02YYUW zieht im Betrieb rund 20 mA
([hardware.md, Abschnitt 5](hardware.md#5-stromverbrauch--überschlägig)). Läge
er dauerhaft an, wären das fast 500 mAh am Tag – eine 18650-Zelle wäre in einer
Woche leer, statt in einem Jahr. Der Sensor **muss** zwischen den Messungen
stromlos sein. Wer nicht drei Einzelteile verlöten will, kauft ein
fertiges Low-Side-Schaltermodul; dann ist es eine Position statt dreier.

### Das Ergebnis

| | heute | minimal |
|---|---|---|
| Positionen | 16 | **7** |
| Preis je Box | 108–168 € | **100–140 €** |
| Laufzeit | 9–15 Monate (A) / 4–6 Jahre (B) | 9–15 Monate |
| Lötstellen | ~20 | ~8 |
| Sicherheitsregeln | 2 | 0 |

Das ist eine echte Verbesserung – und trotzdem die schwächste der hier
untersuchten Antworten. Denn die Kürzung der Stückliste ändert nichts an dem,
was den Eigenbau wirklich teuer macht: Werkzeug für 100–180 €, ein bis zwei
Stunden Arbeit je Box, PlatformIO auf einem Rechner, und eine Firmware, deren
eigenes README festhält, dass sie **noch nie kompiliert wurde**. Das ist kein
Makel des Entwurfs, sondern der ehrliche Stand – aber es ist Arbeit, die noch
vollständig vor uns liegt.

---

## 3. Was man fertig kaufen kann

Alle folgenden Geräte sind vergossene, batteriebetriebene Ultraschall- oder
Radarsensoren mit eingebautem Mobilfunkmodem, wie sie für Abfallbehälter
gebaut werden. Man bestellt sie, hängt sie hinein und stellt sie am Handy ein.

| Gerät | Funk | Messprinzip | Batterie | Antenne | Einrichtung | Protokolle | Preis |
|---|---|---|---|---|---|---|---|
| **Dragino DDS75-CB** | NB-IoT **+ LTE-M** | Ultraschall 0,28–7,5 m | 8500 mAh Li/SOCl₂ | **abschraubbar** | Bluetooth-App oder USB-TTL | MQTT(S), UDP, TCP, CoAP | **98,71 €** |
| Dragino DDS75-NB | NB-IoT | Ultraschall 0,28–7,5 m | 8500 mAh Li/SOCl₂ | abschraubbar | wie oben | MQTT(S), UDP, TCP | 83,24 € (110,61 € mit SIM) |
| **Milesight EM400-MUD (NB)** | NB-IoT / LTE-M | Ultraschall 0,03–4,5 m | 2 × 9000 mAh, **tauschbar** | **innen, vergossen** | **NFC – Handy dranhalten** | MQTT + TLS, TCP, UDP | zu erfragen |
| Milesight EM400-TLD (NB) | NB-IoT / LTE-M | **ToF-Laser** | 2 × 9000 mAh, tauschbar | innen, vergossen | NFC | MQTT + TLS, TCP, UDP | zu erfragen |
| **Sentinum Apollon-Q** | NB-IoT / LTE-M + GNSS | **optisch + Radar**, bis 2,5 m | fest verbaut | zu erfragen | Hersteller | Datahub-API | zu erfragen |
| Sentinum Apollon-Zeta | NB-IoT | Füllstand, „Low Cost" | fest verbaut | zu erfragen | Hersteller | Datahub-API | zu erfragen |

Drei Anmerkungen dazu, die wichtiger sind als die Tabelle:

**Der Dragino ist der offenste.** Er ist der einzige in der Liste mit einer
**abschraubbaren Antenne** – und damit der einzige, bei dem die Antennenfrage
aus Abschnitt 4 sicher lösbar ist. Er lässt sich auf beliebige MQTT-, UDP-,
TCP- oder CoAP-Ziele einstellen, braucht also keine Herstellerwolke. Die
Bluetooth-Einrichtung läuft unter iOS über die Hersteller-App, unter Android
über ein Terminalprogramm; das ist bequem, aber kein Selbsterklärer.

**Der Milesight ist der bequemste – und vielleicht der ungeeignetste.** Die
Einrichtung per NFC, also Handy an das Gehäuse halten, ist die mit Abstand
anwenderfreundlichste Bedienung im Feld. Beschleunigungssensor gegen Diebstahl
und Temperaturfühler gegen Containerbrände sind für Altkleider durchaus
interessant. Aber das Gehäuse ist dicht vergossen, die Antenne sitzt innen. In
einem Stahlcontainer ist das genau der Fehler, vor dem
[hardware.md, Abschnitt 4](hardware.md#4-der-wichtigste-punkt-die-antenne)
warnt. **Vor einer Bestellung muss beim Hersteller geklärt werden, ob es eine
Ausführung mit Antennenanschluss gibt.** Fällt die Antwort negativ aus, ist das
Gerät hier raus.

**Sentinum ist der Anbieter, der den Anwendungsfall kennt.** Die Nürnberger
bewerben Altkleidercontainer ausdrücklich als Einsatzgebiet und kombinieren
optische Messung mit Radar – das ist genau die Antwort auf das Textilproblem
aus Abschnitt 4. Deutschsprachiger Support, SIM im Lieferumfang. Dafür läuft
die Weiterleitung über ihren Datahub, und der Preis steht nicht im Netz.

### Warum kein LoRaWAN

Die technisch reifsten und günstigsten Geräte dieser Klasse funken LoRaWAN:
Elsys ELT, Daviteq (zehn Jahre auf zwei AA-Zellen), Dingtek DF703, Linovision
IOT-S5. Sie sind hier trotzdem nicht brauchbar. LoRaWAN braucht Gateways, und
für 50 bis 300 über den Landkreis Miltenberg verstreute Container hieße das,
ein eigenes Funknetz aufzubauen und zu betreiben – mit Standorten, Strom,
Internetanschlüssen und Wartung. Das ist ein größeres Projekt als das
eigentliche. NB-IoT und LTE-M nutzen dagegen das Telekom-Netz, das ohnehin
steht. Die Entscheidung für Mobilfunk aus [hardware.md](hardware.md) bleibt
richtig.

---

## 4. Der Punkt, an dem es wirklich hängt: das Messprinzip

Altkleidercontainer sind für Füllstandssensoren ein unangenehmer Fall, und zwar
aus einem physikalischen Grund: **Textilien sind Schallschlucker.** Genau die
Eigenschaft, wegen der man Stoff an Wände von Tonstudios hängt, schwächt das
Echo eines Ultraschallsensors. Locker aufgeschütteter Stoff wirft weniger
zurück als eine Wasseroberfläche oder eine Schüttung Kies.

| Prinzip | stark bei | schwach bei | Kosten |
|---|---|---|---|
| **Ultraschall** | weite Kegelabstrahlung, sieht auch unebene Oberflächen | Textilien dämpfen das Echo; Reif auf der Membran | niedrig |
| **ToF-Laser** | sehr genau, kleiner Messfleck, kein Echo nötig | misst nur einen Punkt – schießt durch eine Lücke bis auf den Boden; Staub auf der Optik | mittel |
| **Radar** | unempfindlich gegen Staub, Feuchtigkeit, Temperatur; sieht auch weiche Oberflächen | teuerste Bauart | hoch |

Sentinum kombiniert nicht ohne Grund zwei Prinzipien. Was in einem
Altkleidercontainer wirklich trägt, **lässt sich am Schreibtisch nicht
entscheiden** – und auch nicht durch die Wahl zwischen Eigenbau und
Fertiggerät, denn die Frage stellt sich bei beiden gleichermaßen. Sie lässt
sich nur messen. Darauf läuft die Empfehlung in Abschnitt 8 hinaus.

Der Vollständigkeit halber: Der Eigenbau steht hier nicht besser da. Der
A02YYUW ist derselbe Ultraschallsensor mit demselben Problem – nur ohne
Herstellersupport, wenn er in der Praxis Unsinn misst.

---

## 5. Drei Wege in unsere Datenbank

Heute nimmt `app/api/ingest/route.ts` die Messwerte an. Die Firmware signiert
jede Meldung mit einem eigenen 32-Byte-Schlüssel (HMAC-SHA256) und schickt sie
per HTTPS. Das ist sauber gelöst – aber ein gekauftes Gerät kann es nicht: es
kennt unser Signaturverfahren nicht und lässt sich nicht darauf umprogrammieren.
Ein Fertiggerät braucht also einen zweiten Annahmeweg.

Es gibt drei, und sie sind bewusst hier gegenübergestellt statt entschieden.

### Weg A – über den Mobilfunkanbieter

```
  Gerät ──UDP/CoAP──▶ 1NCE OS ──HTTPS-POST──▶ /api/ingest/webhook
```

1NCE – dessen SIM-Karten in der [Einkaufsliste](einkaufsliste.md) ohnehin
eingeplant sind – bietet zwei zusammenspielende Dienste an: der **Device
Integrator** nimmt UDP, CoAP und LwM2M entgegen, der **Cloud Integrator** leitet
das als HTTPS-POST an eine frei wählbare Adresse weiter, mit selbst gesetzten
Kopfzeilen und Gerätedaten, die sich in URL und Kopfzeilen einsetzen lassen.
Fehlgeschlagene Zustellungen werden fünfmal wiederholt, mit wachsendem Abstand
(150 s, 180 s, 420 s, 1020 s).

*Dafür spricht:* kein zusätzlicher Dienst, den wir betreiben müssten. Das Gerät
braucht weder Zertifikat noch Serveradresse noch TLS – es funkt an einen festen
Endpunkt, den 1NCE vorgibt. Und die Identität des Geräts ist die **ICCID seiner
SIM**, die aus dem Mobilfunknetz stammt und sich nicht fälschen lässt. Das ist
als Identitätsnachweis nicht schwächer als der heutige HMAC, sondern anders
gelagert: statt eines Geheimnisses im Gerät bürgt das Netz.

*Dagegen spricht:* wir binden uns an 1NCE. Ein Wechsel des SIM-Anbieters würde
den Datenweg mitreißen.

*Zu prüfen:* ob der Cloud Integrator im 10-Jahres-Tarif enthalten ist oder
gesondert kostet.

### Weg B – eigener MQTT-Broker

```
  Gerät ──MQTT+TLS──▶ Broker ──Brücke──▶ Datenbank
```

Sowohl Dragino als auch Milesight sprechen MQTT über TLS, mit eigenem Benutzer
und Passwort je Gerät. Ein Broker ließe sich als weiterer Dienst in das
vorhandene `docker-compose.yml` aufnehmen ([docker.md](docker.md), Mosquitto),
oder man mietet einen – HiveMQ Cloud hat einen kostenlosen Tarif.

*Dafür spricht:* völlige Unabhängigkeit – von 1NCE, vom Gerätehersteller, von
jeder Wolke. Benutzer und Passwort je Gerät bilden die heutige Logik der
Gerätegeheimnisse eins zu eins nach. Und MQTT hält die Verbindung, so dass sich
Einstellungen auch zum Gerät zurückschicken lassen.

*Dagegen spricht:* ein Dienst mehr, der laufen, aktuell bleiben und überwacht
werden muss, dazu ein Programm, das die Nachrichten in die Datenbank schreibt.
Beim Betrieb auf Vercel und Supabase, wo es heute keinen dauerhaft laufenden
Prozess gibt, ist das ein echter Bruch in der Architektur.

### Weg C – Herstellerwolke mit Weiterleitung

```
  Gerät ──▶ Sentinum Datahub / Milesight Cloud ──Webhook──▶ /api/ingest/webhook
```

*Dafür spricht:* die geringste eigene Arbeit. Der Hersteller kümmert sich um
Dekodierung, Geräteverwaltung und Zustellung; wir bekommen fertiges JSON.

*Dagegen spricht:* laufende Kosten je Gerät, Abhängigkeit von einem Anbieter,
und die Daten laufen über Dritte. Beim BRK sind Containerstandorte und
Leerungsrhythmen keine Geheimnisse, aber es ist ein Punkt, der vor einem
Vertragsabschluss geprüft gehört – und nicht danach.

### Was am Backend in jedem Fall zu tun wäre

Grobe Schätzung, ausdrücklich kein Auftrag. In allen drei Fällen laufen die
Änderungen auf dasselbe hinaus:

* ein zweiter Annahmeweg neben `/api/ingest`, der sich nicht über HMAC
  ausweist, sondern über ein gemeinsames Geheimnis in der Kopfzeile,
* Gerätesuche über die ICCID statt über die Geräte-ID,
* ein herstellerabhängiger Dekoder, der die Nutzlast in `abstand_mm`,
  `batterie_v` und `rssi` übersetzt,
* ein Feld `bauart` an der Sensortabelle, damit beide Arten nebeneinander
  laufen können,
* in der Geräteaufnahme ein Feld für die ICCID statt der Schlüsselanzeige.

Die Speicher- und Rechenlogik dahinter – Füllstand, Leerungserkennung, Alarme –
bleibt unberührt. Sie hängt an der Messung, nicht daran, wie sie hereinkam.

---

## 6. Was sich für den Anwender ändert

Das war der Ausgangspunkt der Frage, und hier ist der Gewinn am deutlichsten.
Der Vergleich mit [anlernprozess.md](anlernprozess.md):

| Schritt | heute | mit Fertiggerät |
|---|---|---|
| Gerät aufnehmen | Geräte-ID, IMEI, ICCID eintragen | **bleibt** |
| Schlüssel ins Gerät | `geheimnisse.h` anlegen, `pio run -t upload` – oder Werksschlüssel und „Trust on First Use" | **entfällt** – die SIM ist der Ausweis |
| Etikett drucken | QR-Code mit Anlerncode | **bleibt** |
| Sendeziel einstellen | in `konfiguration.h` einkompiliert | einmal am Handy, danach Kopie auf alle Geräte |
| ① QR scannen | | **bleibt** |
| ② Container wählen | | **bleibt** |
| ③ Koppeln | | **bleibt** |
| ④ Kalibrieren | Magnet an den Reed-Kontakt halten | **entfällt** – nächste Meldung abwarten, oder das Intervall für die Anlernphase kurz auf fünf Minuten stellen |

Die vier Schritte draußen am Container bleiben Wort für Wort erhalten. Was
schrumpft, ist die Werkstattphase: von „löten, flashen, Schlüssel eintragen" auf
„Aufkleber lesen und einmal am Handy einstellen".

Damit verschiebt sich auch, **wer** einen Sensor in Betrieb nehmen kann. Heute
braucht es dafür jemanden, der mit einem Lötkolben und einer Kommandozeile
umgehen kann. Mit einem Fertiggerät reicht jemand, der ein Smartphone bedienen
kann und sorgfältig arbeitet. Bei drei Boxen ist das gleichgültig. Bei fünfzig
entscheidet es darüber, ob das Projekt an einer einzelnen Person hängt.

---

## 7. Was es kostet

Je Box, ohne Versand, Preise wie in der [Einkaufsliste](einkaufsliste.md) unter
Vorbehalt:

| | Material je Box | Werkzeug einmalig | Arbeit je Box |
|---|---|---|---|
| Eigenbau, heutige Variante A | 108–145 € | 100–180 € | 1–2 h + Einarbeitung |
| Eigenbau, minimal (Abschnitt 2) | 100–140 € | 100–180 € | 1–1,5 h + Einarbeitung |
| **Dragino DDS75-CB** + SIM + Antennenverlängerung | **111–125 €** | **–** | **~15 min** |
| Milesight EM400 (NB) + SIM | zu erfragen | – | ~15 min |
| Sentinum Apollon | zu erfragen | – | ~15 min |

Hochgerechnet:

| Menge | Eigenbau minimal | Dragino fertig | Unterschied |
|---|---|---|---|
| 3 Boxen | 300–420 € + Werkzeug | 333–375 € | Fertiggerät günstiger, sobald Werkzeug fehlt |
| 20 Boxen | 2.000–2.800 € | 2.220–2.500 € | etwa gleich im Material, **30 h Arbeit gespart** |
| 50 Boxen | 5.000–7.000 € | 5.550–6.250 € | etwa gleich, **75 h gespart**, Mengenrabatt beim Hersteller anfragen |
| 300 Boxen | 30.000–42.000 € | 33.300–37.500 € | in dieser Größenordnung ohnehin Angebote einholen |

**Das Material ist bei beiden Wegen etwa gleich teuer.** Der Unterschied liegt
nicht im Einkauf, sondern in der Arbeit: 20 Boxen im Eigenbau sind rund dreißig
Stunden Facharbeit, 50 Boxen rund fünfundsiebzig. Ob das viel ist, hängt davon
ab, wessen Stunden es sind – das ist eine Entscheidung des Kreisverbands, keine
technische. Aber sie sollte bewusst getroffen werden und nicht unbemerkt in
einer Stückliste verschwinden.

Die laufenden Kosten bleiben in beiden Fällen gleich: die 1NCE-SIM ist mit
rund 12 € für zehn Jahre bezahlt, also gut ein Euro je Container und Jahr.

---

## 8. Empfehlung: erst messen, dann entscheiden

Die Marktübersicht aus Abschnitt 3 ließe sich noch beliebig verlängern – die
entscheidende Frage beantwortet sie damit nicht. Ob ein Sensor in einem
Container voller Textilien brauchbare Werte liefert, steht in keinem
Datenblatt. Deshalb:

### Drei Geräte, drei Messprinzipien, ein Container

| Gerät | Prinzip | Preis | prüft |
|---|---|---|---|
| Dragino DDS75-CB | Ultraschall | ~99 € | den günstigsten und offensten Weg |
| Milesight EM400-TLD oder -MUD (NB) | ToF-Laser bzw. Ultraschall | zu erfragen | die bequemste Bedienung, und die Antennenfrage |
| Sentinum Apollon-Q | optisch + Radar | zu erfragen | ob das teuerste Prinzip den Aufpreis wert ist |

Größenordnung **400–600 € einmalig** – etwa so viel wie das Werkzeug, das der
Eigenbau ohnehin verlangt, und deutlich weniger als drei vergebliche
Anfahrten.

### Messplan

1. Einen Container an einem gut erreichbaren Standort auswählen, Innenhöhe mit
   dem Zollstock aufnehmen.
2. Alle drei Geräte nebeneinander unter den Deckel, senkrecht nach unten, nicht
   über der Einwurfklappe.
3. Fünf Füllstände messen – leer, viertelvoll, halbvoll, dreiviertelvoll, voll –
   jeweils gegen den Zollstock gegengeprüft.
4. Jeden Füllstand **zweimal**: einmal mit locker aufgeschütteten Textilien,
   einmal mit gepressten Säcken. Das ist der Unterschied, der Ultraschall
   entweder trägt oder nicht.
5. Empfangsfeldstärke bei jedem Gerät notieren, einmal mit Antenne innen und
   einmal mit Antenne außen. Der Unterschied gehört dokumentiert – er ist das
   Argument gegenüber jedem, der die Antenne später einsparen möchte.
6. Danach zwei Wochen im laufenden Betrieb stehen lassen und die Kurven
   vergleichen.

**Am Backend ist für den Pilot nichts zu tun.** Die Messwerte lassen sich in
der Oberfläche des jeweiligen Anbieters ablesen – beim Dragino auch direkt im
1NCE-Portal oder an einem beliebigen MQTT-Klienten. Der Anschluss an unsere
Datenbank (Abschnitt 5) ist erst nach der Entscheidung dran, und dann nur für
das Gerät, das gewonnen hat.

Vorbereitet ist die Software allerdings schon auf beide Ausgänge: der
Messbereich hängt am einzelnen Gerät statt an einer festen Grenze, die
Kalibrierung braucht keinen Taster mehr, und die Annahmelogik steht getrennt
von der Signaturprüfung in `lib/messung.ts`, sodass ein zweiter Datenweg eine
Ergänzung wäre und keine Kopie. Womit sich das gegenprüfen lässt, ohne dass ein
Sensor angeschlossen ist, steht in
[api.md, „Ohne Hardware testen"](api.md#ohne-hardware-testen).

### Abbruchkriterien

Ein Gerät scheidet aus, wenn

* die Abweichung gegen den Zollstock über 10 Prozentpunkte liegt,
* die Antenne sich nicht nach außen führen lässt,
* oder die Messwerte nicht ohne Herstellerwolke zu bekommen sind.

### Zeitrahmen

Der Dragino ist aus Deutschland in Tagen da. Für Milesight und Sentinum sind
Angebote einzuholen, das dauert. Bestellungen direkt in China brauchen zwei bis
vier Wochen. Realistisch: **vier bis sechs Wochen bis zur ersten Messreihe,
danach zwei Wochen Beobachtung.**

---

## 9. Was liegen bleibt, wenn wir umsteigen

`firmware/altkleider-sensor/` und der HMAC-Weg in `app/api/ingest/route.ts`
sind fertig ausformuliert und durchdacht. Sie sollten **stehen bleiben und
nicht gelöscht werden** – aus zwei Gründen:

Erstens ist der Eigenbau der Rückfallweg. Besteht kein Fertiggerät die
Antennen- oder die Messprinzip-Prüfung, ist er wieder der beste Plan, den wir
haben.

Zweitens ist der HMAC-Weg der sicherere von beiden. Wenn irgendwann Geräte an
Standorten hängen, an denen es auf Manipulationssicherheit ankommt, ist ein
Geheimnis im Gerät stärker als ein gemeinsames Geheimnis in einer Kopfzeile.
Beide Wege können dauerhaft nebeneinander bestehen; das Feld `bauart` aus
Abschnitt 5 ist genau dafür gedacht.

---

## 10. Vor jeder Bestellung zu klären

Fragen an die Hersteller, in dieser Reihenfolge:

1. **Lässt sich die Antenne nach außen führen?** Abschraubbar oder mit
   Anschluss für ein Verlängerungskabel? *(Ausschlusskriterium)*
2. **Kommen wir ohne Herstellerwolke an die Daten?** Frei einstellbares Ziel für
   MQTT, UDP, TCP oder CoAP? *(Ausschlusskriterium)*
3. Ist das Nutzlastformat dokumentiert, gibt es einen Dekoder?
4. Lässt sich das Sendeintervall aus der Ferne ändern, ohne hinauszufahren? Das
   kann die heutige Lösung, und es soll nicht verloren gehen.
5. Ist die Batterie tauschbar, oder ist das Gerät nach Ablauf Elektroschrott?
6. Bis zu welcher Temperatur arbeitet das Gerät? −20 °C sind das Minimum.
7. Gibt es eine Ausführung mit LTE-M zusätzlich zu NB-IoT? LTE-M bucht schneller
   ein, und das Einbuchen dominiert den Stromverbrauch
   ([hardware.md, Abschnitt 5](hardware.md#5-stromverbrauch--überschlägig)).
8. Mengenpreise ab 20, 50, 300 Stück?
9. Wie lange ist die Lieferzeit, und wie lange gibt es Ersatzgeräte?

---

## Quellen

Preise und Angaben Stand August 2026, ohne Gewähr. Wie schon in der
[Einkaufsliste](einkaufsliste.md) angemerkt: Die Shopseiten waren aus der
Entwicklungsumgebung heraus nur eingeschränkt abrufbar, die Angaben stammen
überwiegend aus Suchergebnissen und Herstellerangaben. **Vor der Bestellung
gegenprüfen.** Wo kein gesicherter Preis vorlag, steht „zu erfragen" statt einer
geschätzten Zahl.

**Geräte**

- [Dragino DDS75-NB – Herstellerseite](https://www.dragino.com/products/distance-level-sensor/item/301-dds75-nb.html)
- [Dragino DDS75-CB – Handbuch (Protokolle, AT-Befehle)](https://wiki.dragino.com/xwiki/bin/view/Main/User%20Manual%20for%20LoRaWAN%20End%20Nodes/DDS75-CB--NB-IoTLTE-M_Distance_Detection_Sensor_User_Manual/)
- [Dragino – Konfiguration per Bluetooth](https://wiki.dragino.com/xwiki/bin/view/Main/BLE%20Bluetooth%20Remote%20Configure/)
- [Antratek.de – DDS75-CB, 98,71 €](https://www.antratek.de/dds75-cb)
- [Antratek.de – DDS75-NB, 83,24 €](https://www.antratek.de/dds75-nb-nb-iot-distance-detection-sensor)
- [Milesight EM400-MUD – Produktseite](https://www.milesight.com/iot/product/lorawan-sensor/em400-mud)
- [Milesight EM400-MUD (NB-IoT) – Handbuch](https://resource.milesight.com/milesight/iot/document/em400-mud-nb-user-guide-en.pdf)
- [Milesight EM400-TLD – ToF-Laser](https://www.milesight.com/iot/product/lorawan-sensor/em400-tld)
- [Sentinum Apollon-Q](https://sentinum.de/en/apollon-q)
- [Sentinum – IoT-Lösungen, Übersicht](https://sentinum.de/en/iot-loesungen)
- [m2mGermany – Sentinum Apollon-Q NB-IoT](https://www.m2mgermany.de/shop/produkt/apollon-q-iot-fuellstandsensor-nb-iot-optisch)
- [m2mGermany – Sentinum Apollon-Zeta, „Low Cost"](https://www.m2mgermany.de/shop/produkt/apollon-zeta-low-cost-iot-fuellstandsensor-nb-iot)

**Anbindung**

- [1NCE OS – Device Integrator (UDP, CoAP, LwM2M)](https://help.1nce.com/dev-hub/docs/1nce-os-device-integrator)
- [1NCE OS – Cloud Integrator (HTTPS-Webhook)](https://help.1nce.com/docs/1nce-os/1nce-os-cloud-integrator/)
- [1NCE OS – Webhook einrichten](https://help.1nce.com/docs/1nce-os/1nce-os-cloud-integrator/cloud-integrator-webhook-configuration/)
- [1NCE OS – Grenzen und Wiederholungen](https://help.1nce.com/docs/1nce-os/1nce-os-cloud-integrator/cloud-integrator-features-limitations/)
- [1NCE – Tarif und Preise](https://www.1nce.com/en-us/1nce-connect/pricing)

**Zum Ausschluss von LoRaWAN**

- [Elvaco – LoRaWAN-Ultraschallsensoren](https://www.elvaco.com/en/news/2026/maj/elvaco-lorawan-ultrasonic-level-sensors--1365)
- [Daviteq – LoRaWAN-Füllstandsensor für Abfallbehälter](https://www.iot.daviteq.com/wireless-sensors/lorawan-ultrasonic-level-sensor-for-trash-bin-ulb)
- [Linovision IOT-S5](https://global.linovision.com/products/lorawan-wireless-ultrasonic-distance-level-sensor-with-battery)
