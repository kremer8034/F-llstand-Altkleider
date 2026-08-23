# Anlern- und Verheiratungsprozess

Wie eine Sensorbox zu „ihrem“ Container kommt – von der Werkbank bis zur
laufenden Messung.

Der Vorgang ist bewusst in zwei getrennte Phasen geteilt: alles, was Ruhe und
einen Rechner braucht, passiert **vorher in der Werkstatt**. Draußen am
Container bleiben drei Handgriffe am Telefon.

---

## Phase 1 – Werkstatt: Gerät aufnehmen

**Intern → Sensoren → Gerät aufnehmen** (Disposition oder Administration)

Eingetragen werden Geräte-ID (frei wählbar, z. B. `ALT-0042`), IMEI, ICCID der
SIM, Hardwarestand, Montageversatz und Sendeintervall.

Beim Speichern erzeugt das System zwei Dinge:

| | Zweck | Wo es hingehört |
|---|---|---|
| **Geräteschlüssel** (32 Byte, hex) | signiert jede Messung, damit niemand fremde Werte einspielen kann | in die Firmware – oder das Gerät holt ihn sich beim ersten Start selbst ab |
| **Anlerncode** (`XXXX-XXXX`) | verheiratet später Gerät und Container | auf den Aufkleber am Gehäuse |

> Der Geräteschlüssel wird **genau einmal** angezeigt. Danach liegt er nur noch
> in der Datenbank, in einer Tabelle, die selbst mit Anmeldung nicht lesbar ist –
> nur der Server kommt heran.

### Schlüssel ins Gerät bekommen – zwei Wege

**a) Mitflashen.** `include/geheimnisse.beispiel.h` nach `include/geheimnisse.h`
kopieren, `GERAETE_ID` und `GERAETE_KEY` eintragen, `pio run -t upload`.
Klarster Weg, wenn ohnehin jede Box einzeln geflasht wird.

**b) Selbst abholen (Trust on First Use).** In alle Boxen kommt dieselbe
Firmware, `GERAETE_KEY` bleibt leer, dafür steht der gemeinsame Werksschlüssel
(`GERAETE_PROVISIONIERUNG_SCHLUESSEL`) darin. Beim allerersten Start meldet sich
das Gerät mit seiner ID bei `/api/geraete/registrieren` und bekommt seinen
eigenen Schlüssel, den es dauerhaft im internen Speicher ablegt.

Das geht **pro Gerät genau einmal**: ist der Schlüssel einmal abgeholt, wird
jeder weitere Versuch abgelehnt. Wer die Box neu aufsetzt, muss den Schlüssel in
der Verwaltung zurücksetzen.

### Etikett drucken

**Sensoren → Etikett** erzeugt eine Druckvorlage mit Geräte-ID, Anlerncode im
Klartext und einem QR-Code. Der QR-Code enthält einen Link, der direkt in den
Anlernvorgang führt – Handykamera drauf, die App ist beim richtigen Schritt.
Laminieren und außen aufs Gehäuse kleben.

---

## Phase 2 – Am Container: verheiraten

**Intern → Sensoren → Sensor anlernen.** Vier Schritte, alles mit dem Telefon.

```
  ①  Gerät          ②  Container        ③  Koppeln        ④  Kalibrieren
  QR scannen        aus der Liste,      prüfen und        Container leer,
  oder Code         nächstgelegener     bestätigen        Taster drücken,
  eintippen         zuerst                                Leerwert übernehmen
```

### ① Gerät erfassen
QR-Code am Gehäuse scannen (der Browser liest ihn ohne zusätzliche App) oder den
achtstelligen Code eintippen. Ohne Kamerafreigabe funktioniert immer die
Eingabe von Hand – der Scanner ist nur die Abkürzung.

### ② Container wählen
Suche über Nummer, Standort und Ort. Ein Tipp auf **„In der Nähe“** sortiert die
Liste nach Entfernung zum aktuellen Standort – am Container steht der richtige
Eintrag dann meist an erster Stelle. Container, an denen schon ein Sensor hängt,
sind entsprechend gekennzeichnet.

### ③ Koppeln
Zusammenfassung, dann *Jetzt koppeln*. Das System prüft dabei:

* Ist der Anlerncode bekannt, noch gültig und noch nicht verbraucht?
* Hängt der Sensor schon an einem anderen Container?
* Hat der Container schon einen anderen Sensor?

In den letzten beiden Fällen bricht der Vorgang ab, bis **„ersetzen“**
angehakt wird. Dann wird das alte Gerät außer Betrieb genommen, die Kopplung mit
Zeitstempel geschlossen und die neue eröffnet. **Die Historie bleibt vollständig
erhalten** – in `sensor_kopplung` steht dauerhaft, welcher Sensor wann an
welchem Container hing, wer ihn angelernt hat und an welchen Koordinaten das
Telefon dabei stand.

Der Anlerncode ist damit verbraucht und wird nicht mehr angenommen – auch wenn
er auf dem Aufkleber weiterhin zu lesen ist. Für einen erneuten Anlernvorgang
(Gerätewechsel, verlorener Aufkleber) stellt die Verwaltung in der Sensorliste
einen neuen aus.

### ④ Kalibrieren
Jetzt lernt das System, welcher Abstand „leer“ bedeutet.

1. Container leeren, Deckel schließen.
2. Eine Messung abwarten oder auslösen. Beim Eigenbau geht das sofort:
   **Magnet an den Reed-Kontakt halten** (bzw. Taster drücken) – das Gerät wacht
   auf, misst und sendet, die LED blinkt zweimal, nach erfolgreicher
   Übertragung dreimal kurz. Ein Gerät ohne Taster meldet sich von selbst; dann
   wartet man den nächsten Sendezeitpunkt ab oder stellt das Intervall für die
   Anlernphase kurz auf fünf Minuten.
3. In der App auf *Leerwert übernehmen* tippen. Das System nimmt den **Median
   der letzten fünf gültigen Messungen** als `leer_abstand_mm`. Wie weit es
   dafür zurückblickt, steht in der Einstellung `kalibrier_fenster_stunden`
   (Standard: sechs Stunden, siehe [betrieb.md](betrieb.md)).
4. Der Vollwert wird daraus abgeleitet (Standard: 15 % des Leerwerts) und lässt
   sich auf der Containerseite jederzeit anpassen.

Geht der Container gerade nicht zu leeren, kann die Innenhöhe auch von Hand in
Millimetern eingetragen werden – ein Zollstock reicht. Denselben Weg nimmt man,
wenn im Zeitfenster keine Messung angekommen ist.

**Ohne Kalibrierung gibt es keinen Prozentwert.** Die Messungen laufen zwar
schon ein und werden gespeichert, aber erst der Leerwert macht daraus einen
Füllstand. Wird später nachkalibriert, rechnet das System **alle vorhandenen
Messungen dieses Containers neu** – die Kurve stimmt also rückwirkend.

---

## Rechnung dahinter

```
fuellstand_% = (leer_abstand_mm − gemessener_abstand_mm)
               ─────────────────────────────────────────  × 100
               (leer_abstand_mm − voll_abstand_mm)
```

begrenzt auf 0–100. Der Montageversatz des Sensors wird vorher auf den
gemessenen Abstand addiert, sodass alle Werte auf die Deckelinnenseite bezogen
sind.

---

## Danach: was von allein passiert

* **Leerung erkannt** – fällt der Füllstand um mindestens 40 Prozentpunkte auf
  unter 30 %, legt das System eine Leerung an. Von Hand erfasste Leerungen
  setzen den Stand sofort auf 0 %.
* **Alarm „voll“** – ab 90 % (einstellbar), schließt sich selbst, sobald der
  Wert wieder unter 75 % fällt.
* **Alarm „kein Signal“** – meldet sich ein angelernter Sensor länger als
  30 Stunden nicht, wird stündlich ein Alarm erzeugt. Er schließt sich mit der
  nächsten Meldung von selbst.
* **Alarm „Batterie schwach“** – unterhalb von 3,4 V.
* **Sendeintervall ändern** – der Server schickt das gewünschte Intervall in der
  Antwort auf jede Messung zurück. Eine Änderung in der Verwaltung greift also
  bei der nächsten Meldung, ohne dass jemand hinausfahren muss.

---

## Gerät tauschen – Kurzfassung

1. Neues Gerät in der Werkstatt aufnehmen, Etikett drucken.
2. Am Container anlernen, beim Koppeln **„ersetzen“** anhaken.
3. Kalibrieren – falls der Sensor an derselben Stelle sitzt, kann der bisherige
   Leerwert einfach stehen bleiben.

Das alte Gerät steht danach auf „außer Betrieb“ und kann in der Werkstatt neu
bestückt werden.
