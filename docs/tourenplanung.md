# Tourenplanung: Standorte, Kosten und Regeltouren

Ursprünglich ein Konzeptpapier: wie die Tourenplanung von „welcher Container
ist voll" auf „welcher Stopp lohnt sich heute" umgestellt wird – und was das
an Datenmodell, Rechenweg und Oberfläche bedeutet.

> **Stand: umgesetzt.** Alle vier Stufen aus Abschnitt 8 sind gebaut. Das
> Papier beschreibt seitdem nicht mehr einen Vorschlag, sondern die Software,
> und die Verweise zeigen auf den Code, der es tut. Die Rechenbeispiele in den
> Abschnitten 2 und 3 sind Testfälle geworden
> ([`supabase/tests/40_standorte.sql`](../supabase/tests/40_standorte.sql),
> [`scripts/kosten-pruefen.mjs`](../scripts/kosten-pruefen.mjs)) – weicht die
> Software von einer Zahl in diesem Papier ab, schlägt ein Test fehl.
>
> Was **nicht** aus dem Code kommt, steht unverändert in Abschnitt 9: die
> echten Kostensätze, die tatsächlichen Regeltouren, die Volumina und die
> Standortzuordnung. Ohne sie rechnet die Software mit Vorschlagswerten.

---

## Die Frage, die sich ändert

Bis Migration 0012 wählte `tourenliste()` nach drei Kriterien aus: Füllstand
über der Schwelle, offene Meldung, oder laut [Prognose](prognose.md) demnächst
fällig. Sortiert wurde nach kürzester Fahrtstrecke
([`lib/route.ts`](../lib/route.ts)).

Das beantwortete: **welcher Container ist voll?**

Gefragt ist aber: **welcher Stopp lohnt sich heute?** In einem Flächenlandkreis
ist ein einzelner voller Container dreißig Kilometer abseits der Route teurer,
als ihn zwei Tage stehen zu lassen. Dafür fehlen vier Dinge:

| Baustein | Was fehlt |
|---|---|
| **Standort** | Mehrere Container nebeneinander sind ein Stopp, kein Container ist ein Stopp |
| **Restkapazität** | „Fünf von sieben voll" heißt nicht „voll" – es sind noch zwei frei |
| **Kosten** | Umwegkilometer und Standzeit, in Euro |
| **Regeltour** | Der Planungshorizont: „ich komme Dienstag ohnehin vorbei" |

**Die vier funktionieren nur zusammen.** Das Kostenmodell allein wäre sogar
schädlich: isoliert betrachtet lohnt sich *kein* einzelner Stopp, weil ihm die
gesamte Anfahrt zugerechnet wird. Erst die Regeltour macht daraus die Aussage,
die man braucht – „lohnt sich **jetzt** nicht, Dienstag aber schon".

---

## 1. Der Standort

### Datenmodell

Eine Tabelle `standort` und ein Verweis darauf am Container:

| Spalte | Wozu |
|---|---|
| `name` | „Netto Parkplatz Großheubach" – das, was das Fahrpersonal sagt |
| `strasse`, `plz`, `ort` | Anschrift des Platzes |
| `lat`, `lng` | ein Punkt für die Routenplanung, nicht mehr je Container |
| `zufahrt` | „Einfahrt hinter dem Markt, Poller mit Dreikant" |
| `bemerkung` | frei |
| `status` | aktiv / inaktiv |

Am Container kommt `standort_id` dazu. Jeder Container gehört zu genau einem
Standort; ein allein stehender Container bekommt einen eigenen. Damit ist der
**Standort durchgängig die Einheit der Planung** – es gibt keine zwei Fälle,
die die Oberfläche unterscheiden müsste.

### Zuordnung von Hand

Es gibt bewusst **keine automatische Gruppierung nach Koordinaten**. Wer
zusammengehört, entscheidet ein Mensch. Zwei Container in Sichtweite können an
verschiedenen Zufahrten liegen; zwei an derselben Adresse können durch eine
Bahnlinie getrennt sein. Das sieht keine Rechnung.

Damit das bei mehreren hundert Containern trotzdem zu schaffen ist:

**Der CSV-Import trägt die Zuordnung mit.** Der Import aus der
DRK-Dienstleistungsdatenbank ([`lib/csv.ts`](../lib/csv.ts),
[`app/intern/import/aktionen.ts`](../app/intern/import/aktionen.ts)) gleicht
schon heute über die Containernummer ab und macht ein Upsert. Eine zusätzliche
Spalte genügt: unbekannte Namen legen einen Standort an, bekannte ordnen zu.
Die Datei pflegt weiterhin ein Mensch in der Tabellenkalkulation – nur eben
tausend Zeilen auf einmal statt tausend Klicks.

Die Spalte heißt `standortname`; erkannt werden ebenso `cluster`, `platz`,
`containerstandort` und `sammelstelle` (Spaltenzuordnung in
[`app/intern/import/Importbereich.tsx`](../app/intern/import/Importbereich.tsx)). **Nicht** `standort` – so heißt im
Export der Dienstleistungsdatenbank bereits die Bezeichnung des einzelnen
Containers, und der Import ordnet sie dorthin zu. Der Cluster braucht deshalb
einen eigenen Spaltennamen.

In der Oberfläche kommt dazu: Standort anlegen, Container zuordnen, Container
verschieben, Standort zusammenführen.

### Eine Folge, die leicht übersehen wird

**Wer einen Standort anfährt, leert dort alles.** Das ist der Sinn des
Clusters, und es verändert eine vorhandene Kennzahl: aus dem
Leerungsrhythmus je Container aus [prognose.md](prognose.md) wird ein
Rhythmus je Standort.

Das ist eine Verbesserung. Die Kennzahl misst dann **Anfahrten** statt
Einzelleerungen – und Anfahrten sind das, was kostet. Die Auswertungsseite
zeigt danach, welche *Standorte* den meisten Fahraufwand verursachen, was die
eigentlich interessante Frage ist.

---

## 2. Restkapazität statt Füllstand

Ein Container mit 60 % hat noch 40 % Platz. Gefragt ist nicht, wie viele
Container voll sind, sondern **wie viel Platz am Standort noch ist**:

```
freie_liter = Σ volumen_liter × (100 − Füllstand) / 100
```

`volumen_liter` steht bereits am Container und wird vom CSV-Import übernommen.

### Das Beispiel des Kreisverbands, durchgerechnet

Sieben Container à 2500 Liter, fünf davon bei 95 %, zwei bei 10 %:

| | Liter |
|---|---|
| Gesamtkapazität | 17 500 |
| frei bei den fünf vollen | 625 |
| frei bei den zwei freien | 4 500 |
| **frei gesamt** | **5 125 = 29 %** |

Bei einer Reserve von 20 % also **nicht anfahren** – genau die Intuition aus
der Praxis, jetzt als Zahl, die sich begründen lässt.

### Die vorausschauende Hälfte

Diese Regel allein wäre falsch. Halten die zwei freien Container nur noch drei
Tage und die Regeltour kommt erst in zehn, quillt der Standort über. Es braucht
also auch: **wie lange hält der Standort noch?**

```
liter_je_tag   = Σ (Rate_i in %-Punkten/Tag × volumen_liter_i / 100)
tage_bis_voll  = (freie_liter − Reserve) / liter_je_tag
```

Die Raten je Container liefert die vorhandene Ansicht `container_prognose`.
Für das Beispiel oben, mit 6 Prozentpunkten pro Tag an den beiden freien
Containern:

| | |
|---|---|
| Zufluss | 2 × 6 % × 2500 l = **300 l/Tag** |
| Reserve (20 % von 17 500) | 3 500 l |
| nutzbar bis zur Reserve | 5 125 − 3 500 = 1 625 l |
| **noch Zeit** | **5,4 Tage** |

### Ein Vorbehalt, der dazugehört

**Die gemessene Zuflussrate unterschätzt die echte Nachfrage.** Volle Container
nehmen nichts mehr auf – sobald fünf von sieben voll sind, verteilt sich der
gesamte Zulauf auf die restlichen zwei, und der gemessene Anstieg dort ist
höher als der „normale". Umgekehrt gilt: wer davorsteht und keinen Platz
findet, nimmt seine Sachen wieder mit oder stellt sie daneben. Das sieht kein
Sensor.

Die Zahl ist also eine **Untergrenze der Nachfrage**, keine Messung davon. Für
die Planung reicht das – man sollte es nur nicht mit Genauigkeit verwechseln.

Fehlt `volumen_liter`, fällt die Rechnung auf die Containerzahl zurück
(„zwei von sieben frei"). Das ist gröber, aber nicht falsch. Die Pflege der
Volumina ist eine Voraussetzung, keine Kür.

---

## 3. Was ein Stopp kostet

### Die Kostenarten

Alle als Einstellung hinterlegt und änderbar; die Werte sind Vorschläge zum
Gegenrechnen, keine Messwerte:

| Einstellung | Vorschlag | Was darin steckt |
|---|---|---|
| `kosten_pro_km` | 0,80 € | Sprit, Verschleiß, Reifen, Wartung, Abschreibung |
| `kosten_pro_stunde` | 45,00 € | Fahrpersonal einschließlich Lohnnebenkosten |
| `minuten_je_stopp` | 8 | anhalten, aufschließen, sichern, weiterfahren |
| `minuten_je_container` | 4 | je Container leeren |
| `durchschnitt_kmh` | 45 | Landstraße im Flächenlandkreis |

### Umwegkosten, nicht Gesamtkosten

Das ist der entscheidende Punkt. Gefragt ist nicht, was die Fahrt zu diesem
Standort kostet, sondern was es kostet, ihn **zusätzlich** in die ohnehin
geplante Route zu hängen:

```
Umweg_km = d(vorher, Standort) + d(Standort, nachher) − d(vorher, nachher)
```

an der günstigsten Einfügestelle. Die Entfernungen liefert `entfernungKm()`
aus [`lib/route.ts`](../lib/route.ts) bereits; gebraucht wird die
Einfügekosten-Rechnung darum herum.

```
Zeit   = Umweg_km / durchschnitt_kmh × 60 + minuten_je_stopp
         + Anzahl Container × minuten_je_container
Kosten = Umweg_km × kosten_pro_km + Zeit / 60 × kosten_pro_stunde
Ertrag = Σ volumen_liter × Füllstand / 100
```

Daraus die Kennzahl, mit der sich Stopps vergleichen lassen:

```
Euro je 100 Liter = Kosten / (Ertrag / 100)
```

### Das Gegenbeispiel

| | Cluster an der Route | Einzelcontainer 34 km abseits |
|---|---|---|
| Container | 3 × 2500 l bei 85 % | 1 × 2500 l bei 95 % |
| Ertrag | 6 375 l | 2 375 l |
| Umweg | 2 km | 34 km |
| Fahrzeit | 3 min | 45 min |
| Standzeit | 20 min | 12 min |
| Fahrtkosten | 1,60 € | 27,20 € |
| Zeitkosten | 17,00 € | 43,00 € |
| **Kosten** | **18,60 €** | **70,20 €** |
| **je 100 Liter** | **0,29 €** | **2,96 €** |

**Faktor zehn.** Das ist die Zahl, mit der sich im Kreisverband begründen
lässt, warum ein voller Container zwei Tage stehen bleibt – und sie zeigt
nebenbei, wo die Kosten wirklich sitzen: nicht im Sprit, sondern in der Zeit.
Selbst beim weit entfernten Stopp sind knapp zwei Drittel der Kosten
Personalkosten.

### Was die Oberfläche damit macht

Der Stopp **verschwindet nicht**. Er bleibt in der Liste, gekennzeichnet als
„lohnt heute nicht", mit der Zahl daneben und dem Tourdurchschnitt als
Vergleich:

> **MIL-032 Sportgelände Weilbach** · 1 Container, 95 % · Umweg 34 km
> **2,96 € je 100 l** – Tourdurchschnitt 0,41 € · gedeckt bis Di, 09.09.

Die Disposition entscheidet und hakt ab. Das System begründet, es bestimmt
nicht.

---

## 4. Wann ein Stopp trotzdem mit muss

Ohne Notbremsen würde die reine Wirtschaftlichkeit einen abgelegenen Standort
nie wieder anfahren – er wäre immer der teuerste. Drei Regeln überstimmen das
Kostenurteil:

1. **Zu lange voll.** Ein Container liegt länger als
   `max_tage_ueber_schwelle` (Vorschlag: 7 Tage) über der Vollschwelle.
2. **Offene Meldung.** Intern erfasst oder vom Bürger gemeldet (Abschnitt 6).
3. **Ungedeckt.** Der Standort wäre vor dem nächsten planmäßigen Besuch dicht.

Regel 3 ist die eigentliche Antwort auf die Frage, ob ein Container zwei Tage
voll stehen darf: **ja – solange die Regeltour eintrifft, bevor der Standort
keine Kapazität mehr hat.**

---

## 5. Regeltouren

### Datenmodell

| Tabelle | Inhalt |
|---|---|
| `route` | Name („Tour Nord"), Farbe, `wochentag` (0–6), `intervall_wochen`, `anker_datum`, aktiv |
| `route_standort` | welcher Standort auf welcher Route, mit Reihenfolge |

„Jeden zweiten Dienstag" ist damit: Wochentag = 2, Intervall = 2 Wochen, dazu
ein Ankerdatum, das einen tatsächlichen Termin festlegt. Daraus lässt sich
jeder künftige Termin ausrechnen, ohne eine Terminliste zu pflegen.

Ein Standort darf auf mehreren Routen liegen – dann zählt der **früheste**
Termin. Das ist wichtig für Standorte, die zwei Gebiete berühren.

### Deckung und Aufschub

Aus den Routen ergibt sich je Standort `naechster_planbesuch_am`, und daraus
die beiden Begriffe, um die sich die neue Tourenliste dreht:

| Begriff | Bedeutung |
|---|---|
| **Aufschub** | Wie viele Tage kann dieser Stopp warten? = `tage_bis_voll` aus Abschnitt 2 |
| **Deckung** | Kommt die Regeltour rechtzeitig? `naechster_planbesuch_am ≤ voll_am` |

### Die Entscheidungslogik in einem Stück

Für jeden Standort, in dieser Reihenfolge:

```
1. Restkapazität und tage_bis_voll rechnen        (Abschnitt 2)
2. Greift eine Notbremse?                          (Abschnitt 4)
      ja  -> PFLICHT: kommt auf die Tour
3. Ist der Standort gedeckt?
      ja  -> RUHT:    Vermerk "Regeltour Di, 09.09.", nicht auf der Tour
4. sonst -> KANN:     erscheint mit Umwegkosten als Vorschlag
5. Für alle Pflicht-Stopps die Route planen        (lib/route.ts, unverändert)
6. Für die Kann-Stopps die Umwegkosten gegen diese Route rechnen
      und nach "Euro je 100 Liter" sortiert anzeigen
```

Drei Zustände statt heute zwei: **Pflicht**, **Kann**, **Ruht**. Die
Umwegkosten werden für Pflicht *und* Kann angezeigt – bei „Kann" entscheiden
sie, bei „Pflicht" sind sie Information. Auch die ist nützlich: ein
Pflicht-Stopp für 4 € je 100 Liter ist ein Argument, die Regeltour für dieses
Gebiet zu verdichten.

---

## 6. Der QR-Code am Container

Ein eigenständiger Baustein, öffentlich zugänglich, ohne Anmeldung. Er hat zwei
Funktionen und einen Nebennutzen.

### Nächster Container mit Platz

Der Bürger kennt die Container seiner Nachbarschaft, aber nicht den nächsten
freien. Der QR-Code führt auf eine Seite, die genau das zeigt.

**Die Sortierung läuft im Browser.** Die öffentliche Containerliste gibt es
bereits unter `/api/oeffentlich/container` – gerundete Füllstände, keine
Sensordaten (siehe [api.md](api.md)). Die Seite lädt sie und sortiert lokal
nach Entfernung zur Geräteposition.

Damit **verlässt die Position des Bürgers das Gerät nie**. Das ist nicht nur
datenschutzfreundlich, es spart auch einen Endpunkt und funktioniert ohne
Standortfreigabe weiter: ohne GPS wird nach Entfernung zum gescannten
Container sortiert, der ja bekannt ist.

### „Container ist voll" melden

Ein Knopf, der eine `meldung` vom Typ `voll` anlegt. Tabelle und Typ gab es
schon, und die Planung zog offene Meldungen ohnehin heran; dazugekommen sind
die Felder `quelle` (`intern` / `oeffentlich`) und `anzahl`.

Geschrieben wird nicht direkt. `anon` hat auf `meldung` weder Lese- noch
Schreibrecht; der einzige Weg von außen ist die Funktion
`meldung_oeffentlich(container_id)` – `security definer`, und sie kann genau
eines: „dieser Container ist voll".

### Missbrauchsschutz und Datenschutz

Ein öffentlicher Schreibzugriff braucht Regeln:

* **Keine Koordinaten speichern.** Nicht die des Bürgers, nicht gerundet, gar
  nicht. Die Meldung kennt den Container – der steht ohnehin fest.
* **Keine Cookies, keine Anmeldung, kein Freitext.** Nur der Knopf. Damit gibt
  es nichts zu moderieren und nichts zu speichern, das Rückschlüsse zulässt.
* **Mehrfachmeldungen je Container zusammenfassen.** Innerhalb von
  `meldung_zusammenfassen_stunden` (6) wird eine bestehende offene Meldung
  hochgezählt statt eine neue angelegt. Der Zeitstempel bleibt dabei stehen –
  sonst ließe sich das Fenster durch Dauerdrücken endlos verlängern.
* **Obergrenze `meldung_hoechstzahl` (25)** für den Zähler, damit sich die
  Liste nicht fluten lässt. Fünfzig Knopfdrücke ergeben eine Meldung mit dem
  Zähler 25 – nachgeprüft in
  [`supabase/tests/40_standorte.sql`](../supabase/tests/40_standorte.sql).
* **Das ist kein Ersatz für eine echte Ratenbegrenzung.** Die gehört davor, an
  den Webserver; eine Datenbankfunktion kann sie nicht leisten, ohne ein
  Erkennungsmerkmal der meldenden Person zu speichern – und genau das soll sie
  nicht.
* **Eine Bürgermeldung löst keine Fahrt aus.** Sie erhöht die Dringlichkeit
  und wird der Disposition angezeigt – die Entscheidung bleibt dort.

### Nutzen für die Prognose – ehrlich eingeordnet

Die Häufigkeit solcher Meldungen ist ein **Hinweis, keine Messung**. Sie ist
nicht überprüfbar, hängt davon ab, wie viele Menschen den Aufkleber überhaupt
scannen, und lässt sich manipulieren.

Brauchbar ist sie trotzdem, für zwei Dinge:

1. **Als Gegenprobe zum Sensor.** Melden mehrere Bürger „voll", der Sensor sagt
   aber 40 %, stimmt etwas nicht – verklemmte Klappe, verrutschter Sensor,
   Sperrmüll auf dem Füllgut. Das ist ein Wartungshinweis, kein Füllstand.
2. **Als schwach gewichtetes Zusatzsignal** in der Dringlichkeit – nicht in der
   Füllstandsrechnung. Der gemessene Abstand bleibt die einzige Quelle für
   Prozentwerte.

---

## 7. Was das für die vorhandene Prognose bedeutet

Die Ansichten `container_prognose` und `container_rhythmus` aus
[prognose.md](prognose.md) sind unverändert geblieben. Über ihnen liegen jetzt
`standort_zustand` (Restkapazität, Zufluss je Tag) und `standort_planung`
(Aufschub, Deckung, Zustand); die Containerrate geht dort mit dem Volumen
gewichtet in den Zufluss des Standorts ein.

Sortiert wird nicht mehr nach Füllstand, sondern nach **Pflicht vor Kann** und
darin nach dem knappsten Aufschub.

`tour_vorlauf_tage` ist **geblieben**, in veränderter Rolle: die Einstellung
entscheidet nicht mehr, welcher Container vorausschauend mitkommt, sondern wie
früh ein **ungedeckter** Standort zur Pflicht wird. Ist ein Standort durch eine
Regeltour gedeckt, spielt der Vorlauf keine Rolle – dann zählt der Termin.

---

## 8. Die Stufen und wo sie stehen

Jede Stufe war für sich nutzbar; gebaut wurden sie in dieser Reihenfolge.

Stufe 5 kam nach diesem Papier dazu und beantwortet, was die ersten vier offen
ließen: die geplante Tour war ein Vorschlag im Browser und ließ sich weder
speichern noch jemandem zuweisen. Sie ist in
[fahrbetrieb.md](fahrbetrieb.md) beschrieben.

| Stufe | Inhalt | Migration | Oberfläche |
|---|---|---|---|
| **1** | Standorte, Zuordnung, Restkapazität | [`0011_standorte.sql`](../supabase/migrations/0011_standorte.sql) | `/intern/standorte` |
| **2** | Kostenmodell, Umwegkosten, Euro je 100 Liter | – ([`lib/kosten.ts`](../lib/kosten.ts), [`lib/route.ts`](../lib/route.ts)) | `/intern/touren` |
| **3** | Regeltouren, Deckung, drei Zustände | [`0012_regeltouren.sql`](../supabase/migrations/0012_regeltouren.sql) | `/intern/routen` |
| **4** | Öffentlicher QR-Code | [`0013_buergermeldung.sql`](../supabase/migrations/0013_buergermeldung.sql) | `/container/<Nummer>`, Etikett unter `/intern/container/<id>/etikett` |
| **5** | Tagestouren, Fahrerablauf, Bauhöfe | [`0014_entsorger.sql`](../supabase/migrations/0014_entsorger.sql), [`0015_touren.sql`](../supabase/migrations/0015_touren.sql), [`0016_adresse_am_standort.sql`](../supabase/migrations/0016_adresse_am_standort.sql) | `/intern/touren`, `/intern/entsorger`, `/fahrer` |

Stufe 2 braucht keine Migration: die Kostensätze sind Einstellungen, gerechnet
wird im Browser aus Daten, die ohnehin schon geladen sind. Damit ändert sich
die Rechnung sofort, wenn die Disposition an einem Satz dreht – ohne Rundreise
zum Server.

---

## 9. Was der Kreisverband beisteuern muss

Nichts davon kommt aus dem Code:

| | Wofür |
|---|---|
| **Kostensätze** – €/km, €/Stunde, Minuten je Stopp und je Container | ohne sie ist die Kennzahl in Abschnitt 3 eine Rechenübung |
| **Die tatsächlichen Regeltouren** – Name, Wochentag, Abstand, welche Standorte | Abschnitt 5 steht und fällt damit |
| **Die Volumina der Container** in `volumen_liter` | sonst nur Containerzählung statt Litern |
| **Die Standortzuordnung** – welche Container gehören zusammen | Zuordnung von Hand, wie entschieden |

Die ersten drei lassen sich schätzen und später verbessern. Die
Standortzuordnung nicht – die muss stimmen, sonst rechnet alles Weitere an der
Wirklichkeit vorbei.

---

## Der nächste Schritt

Die Software steht; die Wirklichkeit fehlt ihr noch. Vier Dinge in dieser
Reihenfolge:

1. **Die echten Kostensätze eintragen** (Abschnitt 3). Bis dahin rechnet die
   Software mit den Vorschlagswerten – 0,80 €/km und 45 €/Stunde sind
   plausibel, aber nicht die Zahlen des Kreisverbands.
2. **Cluster zusammenführen.** Der Ausgangszustand ist ein Standort je
   Container. Solange nichts zusammengeführt ist, verhält sich die Planung
   genau wie vorher – der Nutzen entsteht erst mit den Clustern.
3. **Ein bis zwei echte Regeltouren anlegen** und Standorte zuordnen. Erst
   damit gibt es überhaupt eine Deckung, und erst dann kann ein Stopp „warten
   bis Dienstag".
4. **Gegenprobe an einer gefahrenen Tour.** Was hätte die Logik ausgewählt,
   was ist tatsächlich gefahren worden, wo liegt der Unterschied? Weicht sie
   ab, ist zuerst zu prüfen, ob die Standortzuordnung stimmt – sie ist die
   Voraussetzung, an der alles Weitere hängt.

Ein Hinweis zum Betrieb: solange nicht alle Container einem Standort zugeordnet
sind, fallen die übrigen aus der Planung heraus. `/intern/standorte` weist
darauf hin und legt auf Knopfdruck je Container einen eigenen Standort an.
