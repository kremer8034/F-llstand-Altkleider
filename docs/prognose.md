# Prognose und Leerungsrhythmus

Zwei Zahlen, die aus den vorhandenen Daten entstehen und nirgends gespeichert
werden:

- **Prognose** – wann muss dieser Container voraussichtlich wieder geleert
  werden?
- **Leerungsrhythmus** – wie oft musste er es bisher?

Beides rechnet die Datenbank in zwei Ansichten
(`supabase/migrations/0010_prognose.sql`), nicht die Oberfläche. Wird eine
Leerung nachträglich korrigiert oder gelöscht, ändern sich die Zahlen sofort
mit – es gibt keinen zwischengespeicherten Stand, der veralten könnte.

---

## Der Leerungsrhythmus

**Die Kennzahl ist das arithmetische Mittel der Abstände zwischen zwei
aufeinanderfolgenden Leerungen desselben Containers.** Nicht der Durchschnitt
über alle Container – jeder Standort hat seinen eigenen Rhythmus, und genau
dieser Unterschied ist das Interessante.

Wurde ein Container am 1., am 21. und am 31. geleert, sind die Abstände 20 und
10 Tage, der Mittelwert also 15 Tage. Daraus folgt die Hochrechnung
**365,25 ÷ 15 ≈ 24 Leerungen im Jahr**.

Daneben stehen drei weitere Werte, weil ein Mittelwert allein nicht verrät, ob
man sich auf ihn verlassen kann:

| Wert | Wozu |
|---|---|
| Streuung | 14 Tage aus 13/14/15 sind etwas anderes als 14 Tage aus 3/25 |
| kürzester und längster Abstand | zeigt die Spannweite ohne Statistikkenntnisse |
| Zahl der Leerungen | unter drei Abständen kennzeichnet die Oberfläche den Wert als „noch dünn" |

**Zwei Leerungen dichter als zwölf Stunden beieinander zählen nicht.** Trägt
jemand eine Leerung von Hand nach, die der Sensor schon selbst erkannt hat,
stehen zwei Einträge fast gleichzeitig in der Tabelle. Ohne diese Grenze bräche
der Mittelwert ein. Die Grenze steht in der Einstellung
`leerung_min_abstand_stunden`.

Die Rangliste über alle Container steht unter **Intern → Auswertung**, sortierbar
nach Häufigkeit, Seltenheit und nächster Fälligkeit.

---

## Die Prognose

Gefragt ist: bei welchem Tempo füllt sich dieser Container, und wann erreicht er
damit die Schwellen? Das Tempo kommt aus zwei Quellen, und **beide sind in der
Oberfläche sichtbar**, damit die Zahl nachvollziehbar bleibt.

### Quelle 1 – die Messreihe des laufenden Zyklus

Alle gültigen Messungen seit der letzten Leerung, durch die eine Ausgleichs­gerade
gelegt wird (lineare Regression). Deren Steigung ist der Anstieg in
Prozentpunkten pro Tag.

Verlangt werden mindestens **vier Messpunkte über mindestens einen Tag**, und
der Füllstand muss steigen. Ein fallender Anstieg heißt: gerade geleert oder
Messfehler – daraus lässt sich nichts hochrechnen.

### Quelle 2 – der bisherige Rhythmus

Wenn ein Container im Mittel alle 20 Tage geleert wird, füllt er sich von 0 auf
100 % in 20 Tagen. Das sind **100 ÷ 20 = 5 Prozentpunkte pro Tag**.

### Wie beides zusammenkommt

Gewichtet nach Datenlage:

```
             Tage im laufenden Zyklus (max. 7) × Messrate
           + Zahl der erfassten Abstände (max. 4) × Rhythmusrate
  Anstieg = ────────────────────────────────────────────────────
                       Summe der beiden Gewichte
```

Am Anfang eines Zyklus trägt also die Erfahrung, nach einer Woche Messung trägt
die Messung. Liegt nur eine der beiden Quellen vor, wird sie allein verwendet;
die Oberfläche schreibt dann „nur Messung" bzw. „nur Historie" dazu.

### Daraus die beiden Termine

```
  Tage bis zur Tourenschwelle = (75 % − aktueller Füllstand) ÷ Anstieg
  Tage bis voll               = (90 % − aktueller Füllstand) ÷ Anstieg
```

Die Schwellen sind die vorhandenen Einstellungen `schwelle_warnung` und
`schwelle_voll`. Der erste Termin ist der, nach dem geplant wird; der zweite
sagt, wie viel Luft danach noch bleibt.

Liegt keine der beiden Quellen vor, erscheint **kein Datum**, sondern ein Satz,
der benennt was fehlt. Eine Hochrechnung aus einer einzigen Messung wäre eine
erfundene Genauigkeit.

---

## Wirkung auf die Tourenplanung

Die Prognose je Container ist die **Zulieferung**, nicht die Entscheidung. Die
Planung entscheidet auf Standort-Ebene ([tourenplanung.md](tourenplanung.md)):
die Rate `rate_prozent_pro_tag` geht dort, mit dem Volumen gewichtet, in den
Zufluss des Standorts in Litern je Tag ein. Daraus wird der **Aufschub** – wie
viele Tage der Stopp noch warten kann, bis die Reserve aufgebraucht ist.

Damit nimmt die Planung auch Standorte auf, die **noch Platz haben, laut
Prognose aber demnächst dicht sind**. Wie früh, steht weiterhin in
`tour_vorlauf_tage` (Standard: 3) – die Einstellung gilt jetzt nur für
Standorte, die **keine Regeltour deckt**. Ist ein Standort gedeckt, zählt der
Termin und nicht die Tagezahl.

Solche Einträge tragen den Grund **`laeuft_voll`**; die Oberfläche schreibt
dazu, wie viele Tage noch bleiben. Die Reihenfolge folgt weiterhin der
kürzesten Fahrtstrecke.

Wer die Vorausschau nicht möchte, setzt `tour_vorlauf_tage` auf `0` – dann
kommt ein ungedeckter Standort erst mit, wenn die Reserve tatsächlich
unterschritten ist.

**Ohne Standortzuordnung passiert nichts davon.** Die Planung geht vom Standort
aus; ein Container ohne Zuordnung hat keinen Stopp und taucht in keiner Tour
auf, so gut die Prognose auch ist. `/intern/standorte` weist darauf hin.

---

## Was die Prognose nicht kann

* **Kein Wochentagsmuster.** Dass samstags mehr eingeworfen wird als dienstags,
  ist plausibel, aber für einen belastbaren Wochenverlauf braucht es Monate an
  Daten. Die Stelle dafür ist in der Ansicht `container_prognose` vorbereitet.
* **Keine Saison.** Frühjahrsputz und Vorweihnachtszeit schlagen erfahrungsgemäß
  durch; das erkennt erst ein zweites Betriebsjahr.
* **Keine Vorhersage von Ereignissen.** Eine Kleiderspende nach einem Aufruf
  füllt einen Container an einem Nachmittag – dagegen hilft keine Hochrechnung,
  sondern der Alarm bei 90 %.
* **Nichts ohne Kalibrierung.** Ohne Leerwert gibt es keinen Prozentwert und
  damit auch keinen Anstieg (siehe [anlernprozess.md](anlernprozess.md)).

Die Prognose ersetzt also nicht die Messung, sie ordnet sie zeitlich ein.

---

## Nachrechnen

`supabase/tests/30_prognose.sql` prüft die Rechnung an Zahlen, die sich im Kopf
nachvollziehen lassen: ein Container mit den Abständen 20/20 Tage, einer mit
10/15, dazu eine Doppelerfassung, die ausgesondert werden muss. Bei einer
Kalibrierung von 1000 mm leer und 200 mm voll gilt
`Füllstand % = (1000 − Abstand) ÷ 8`; eine Messreihe von 40 mm pro Tag ergibt
damit genau 5 Prozentpunkte pro Tag. Ausführung wie in
[supabase/tests/README.md](../supabase/tests/README.md) beschrieben.
