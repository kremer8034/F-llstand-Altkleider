# Tagestouren, Fahrerablauf und Fremdmüll

Was [tourenplanung.md](tourenplanung.md) offen ließ: die geplante Tour war ein
Vorschlag im Browser. Sie ließ sich nicht speichern, nicht jemandem zuweisen
und danach nicht nachlesen. Dieses Papier beschreibt, was daraus geworden ist.

> **Stand: umgesetzt.** Migrationen
> [`0014_entsorger.sql`](../supabase/migrations/0014_entsorger.sql),
> [`0015_touren.sql`](../supabase/migrations/0015_touren.sql),
> [`0016_adresse_am_standort.sql`](../supabase/migrations/0016_adresse_am_standort.sql);
> Oberfläche unter `/intern/touren`, `/intern/entsorger` und `/fahrer`.
> Geprüft in [`supabase/tests/50_touren.sql`](../supabase/tests/50_touren.sql).

---

## 1. Vorlage und Instanz

Die Unterscheidung, an der alles hängt:

| | `route` (Regeltour) | `tour` (Tagestour) |
|---|---|---|
| Was es ist | eine **Vorlage**: Gebiet und Rhythmus | eine **Instanz**: ein Tag, ein Fahrer |
| Beispiel | „Tour Nord, jeden zweiten Dienstag" | „Tour Nord, 09.09., Herr Müller" |
| Wozu | Deckungsrechnung – darf ein voller Container warten? | Fahrauftrag – wer fährt heute wohin? |
| Anzahl | eine je Gebiet | beliebig viele je Tag |

Aus einer Regeltour entsteht mit einem Klick eine Tagestour
(`tour_aus_route()`); Standorte und Reihenfolge kommen mit. Danach lebt die
Tour eigenständig: wird die Regeltour gelöscht, bleibt die gefahrene Tour
bestehen. `route_id` ist reine Herkunftsangabe.

**Mehrere Touren am selben Tag sind der Normalfall**, nicht die Ausnahme – zwei
Fahrzeuge, zwei Gebiete, oder Vormittag und Nachmittag. Am Datum steht deshalb
bewusst keine Eindeutigkeitsbedingung.

---

## 2. Was gespeichert wird

```
tour             ein Fahrauftrag: Tag, Fahrer, Zustand, Zeitstempel
 └ tour_stopp    ein Standort darin, mit Reihenfolge und Erledigungszustand
    └ tour_container   was mit jedem einzelnen Container geschehen ist
```

`tour_container` ist die Zeile, die den Unterschied macht. `geleert = false`
mit Grund heißt: der Container war da, wurde aber nicht geleert – Fremdmüll
drin, Klappe verklemmt, zugeparkt. Vorher verschwand dieser Fall lautlos und
fiel erst beim nächsten Vollalarm auf. Jetzt entsteht daraus eine `meldung`
an die Disposition, und die Planung zieht sie beim nächsten Lauf heran.

Die fachliche Leerung landet weiter in `public.leerung` – dort, wo sie schon
immer stand. Getrennt gehalten, weil eine Leerung auch ohne Tour erfasst werden
kann (Handeintrag) und eine Tourzeile auch ohne Leerung existiert (eben dann,
wenn nicht geleert wurde).

### Der Zustand `abgebrochen`

Kein Schönheitsfehler, sondern der ehrliche Ausgang einer Tour, die wegen Panne
oder Wetter nicht zu Ende gefahren wurde. Ohne ihn bliebe sie ewig auf `laeuft`
stehen und verfälschte jede Auswertung.

---

## 3. Der Fahrerablauf

`/fahrer` ist kein Ausschnitt des internen Bereichs, sondern eine eigene
Oberfläche. Sie wird einhändig bedient, im Stehen, neben einem laufenden
Fahrzeug, oft mit Handschuhen und bei Sonne auf dem Display.

```
Übersicht  →  Fahren  →  Vor Ort  →  Fahren  →  …  →  Fertig
   │            │           │                          │
"Tour        Zufahrt,    je Container            "Tour abschließen"
beginnen"    Navi,       geleert / stehen
             "Ich bin da"  geblieben + Grund
```

Auf jedem Bildschirm steht genau eine Frage, und der nächste Schritt ist der
größte Knopf. **Eine Liste aller Stopps mit Kästchen zum Abhaken wäre für die
Disposition richtig und für jemanden am Container falsch** – der will nicht
suchen, wo er gerade ist.

Voreinstellung am Container ist „geleert": das ist der Normalfall, und wer
nichts sagt, hat geleert. Nur was stehen bleibt, verlangt eine Angabe.

### Was die Disposition davon sieht

Fortschritt je Tour: erledigte und offene Stopps, das nächste Ziel, wie viele
Container geleert wurden und wie viele stehen geblieben sind (Ansicht
`tour_fortschritt`).

**Ausdrücklich nicht: die Position des Fahrzeugs.** Was die Planung steuert,
ist „wie weit ist er?", nicht „wo ist er?". Das eine ist Disposition, das
andere Überwachung von Menschen, und für die gibt es hier keinen Grund.

---

## 4. Funklöcher

Im Flächenlandkreis gibt es Funklöcher, und ein Container steht selten dort, wo
der Empfang gut ist. Ohne Vorkehrung hieße das: der Fahrer bestätigt, es
passiert nichts, er drückt nochmal – und wenn dann doch beides ankommt, stehen
zwei Leerungen in der Auswertung.

Die Lösung besteht aus zwei Teilen, und **nur beide zusammen tragen**:

1. **Warteschlange im Gerät** ([`lib/offline.ts`](../lib/offline.ts)). Jede
   Bestätigung landet zuerst im `localStorage` und gilt der Oberfläche damit
   sofort als erledigt. Gesendet wird danach; misslingt es, bleibt der Auftrag
   stehen und geht raus, sobald wieder Netz da ist.

2. **Wiederholbare Buchung** (`tour_stopp_abschliessen()`). Derselbe Aufruf
   zweimal ergibt denselben Zustand und keine zweite Leerung.

Eine Warteschlange allein würde Dubletten erzeugen, sobald sie nicht sicher
weiß, ob der erste Versuch angekommen ist – und das weiß sie nie. Eine
wiederholbare Buchung allein hülfe nichts, wenn die Bestätigung im Funkloch
einfach verloren geht.

Der Fahrer sieht, wie viele Bestätigungen noch ausstehen, und kann
weiterfahren. Die Tour selbst liegt ebenfalls im Gerät – wer im Funkloch die
Seite neu lädt, weiß sonst nicht mehr, wo er hin sollte.

Eine abgeschlossene Tour nimmt nichts mehr an. Sonst schöbe eine spät
nachgesendete Bestätigung Zahlen in eine bereits ausgewertete Tour.

---

## 5. Fremdmüll und die Bauhöfe

Mit den Gemeinden bestehen Absprachen: liegt Restmüll im Altkleidercontainer,
bleibt er stehen und der Bauhof holt ihn ab. Wo es keine Absprache gibt, muss
das Fahrpersonal ihn mitnehmen.

Das Fahrpersonal braucht diese Auskunft **am Stopp**, in dem Moment, in dem es
den Deckel öffnet.

### Warum eine eigene Tabelle

Die Auskunft ist **standortbezogen gültig** – der Fahrer fragt „wer ist hier
zuständig?" –, ihr Inhalt aber ist **gemeindebezogen**. Ein Bauhof betreut alle
Standorte seiner Gemeinde.

Als drei Felder am Standort stünde dieselbe Rufnummer bei dreißig Standorten.
Ändert sie sich, müsste sie dreißig Mal nachgezogen werden – was in der Praxis
heißt: an sechs Stellen bleibt die alte stehen, und das Fahrpersonal ruft ins
Leere.

Deshalb: Kontaktdaten einmal je Bauhof in `entsorger`, am Standort nur
`entsorger_id`. Die Zuordnung schlägt die Oberfläche anhand des Orts vor
(Spalte `gemeinde`), bestätigen muss sie ein Mensch – Ortsname und
Gemeindegebiet sind nicht dasselbe, und ein Standort kann am Ortsrand der
Nachbargemeinde liegen. Ein Knopf ordnet einen Bauhof allen noch freien
Standorten seiner Gemeinde auf einmal zu.

### Kein Eintrag ist auch eine Aussage

`entsorger_id IS NULL` heißt nicht „noch nicht gepflegt", sondern **„keine
Absprache, Müll mitnehmen"**. Die Fahreransicht sagt das auch so, statt ein
leeres Feld zu zeigen. Ein Pflichtfeld würde nur dazu verleiten, irgendetwas
einzutragen.

Umgekehrt gilt: ein Entsorger ohne Telefon **und** ohne E-Mail wird nicht
gespeichert (Prüfbedingung `entsorger_erreichbar`). Er wäre schlimmer als
keiner – er sagt dem Fahrpersonal „es gibt eine Absprache", und dann steht es
am Container und kommt nicht weiter.

Die Bauhofseite zeigt deshalb nicht nur die Stammdaten, sondern auch die
**Lücken**: in welchen Gemeinden Standorte ohne Bauhof stehen. Eine reine
Stammdatenliste würde nicht zeigen, was fehlt – und was fehlt, merkt sonst
erst der Fahrer vor dem offenen Container.

---

## 6. Was der Kreisverband beisteuern muss

Wie in [tourenplanung.md](tourenplanung.md) Abschnitt 9: nichts davon kommt aus
dem Code.

| | Wofür |
|---|---|
| **Die Bauhöfe** – Name, Gemeinde, Rufnummer, Erreichbarkeit | ohne sie zeigt jeder Stopp „Müll mitnehmen" |
| **Die Fahrerkonten** und wer welche Tour fährt | ohne Zuweisung erscheint eine Tour in keiner Fahreransicht |

Beides ist in einer Stunde eingetragen und danach jahrelang gültig.
