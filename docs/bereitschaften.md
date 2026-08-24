# Bereitschaften: mehrere Dispositionen unter einem Dach

Beim BRK Miltenberg kümmern sich mehrere Bereitschaften um jeweils eigene
Plätze und fahren ihre eigenen Touren. Bis hierher kannte die Anwendung diesen
Unterschied nicht: jede Disposition sah alles und konnte alles ändern. Fachlich
war das falsch, im Betrieb gefährlich – wer die Tour einer fremden Bereitschaft
umstellt, merkt es nicht, und die andere Seite merkt es erst am Fahrzeug.

Die **Bereitschaft** ist deshalb eine Organisationseinheit über Standorten und
Touren, mit eigenen Rechten.

---

## 1. Die beiden Regeln, ohne die es im Betrieb nicht aufgeht

Das Einschalten darf keinem Haus den Arbeitstag zerlegen. Deshalb gilt:

**Wer keiner Bereitschaft zugeordnet ist, sieht alles.**
Das ist der Zustand unmittelbar nach dem Einspielen: es gibt weder
Bereitschaften noch Zuordnungen, also ändert sich für niemanden etwas. Die
Einschränkung entsteht erst, wenn ein Konto einer Bereitschaft zugeordnet wird –
eine bewusste Entscheidung der Administration, keine Nebenwirkung.

**Was keiner Bereitschaft zugeordnet ist, sehen alle.**
Ein Standort ohne Bereitschaft ist gemeinsame Sache, nicht Niemandsland.
Andernfalls wäre jeder noch nicht zugeordnete Platz für die Disposition
unsichtbar – und unsichtbare Standorte werden nicht angefahren.

Die **Administration ist von beidem ausgenommen**: sie sieht immer alles. Sonst
könnte sie die Zuordnung nicht mehr pflegen, die sie selbst aussperrt.

Und: **das eingeteilte Fahrpersonal sieht seine eigene Tour immer**, auch über
Bereitschaftsgrenzen hinweg. Aushilfe ist der Normalfall, nicht die Ausnahme.

---

## 2. Was zugeordnet wird – und was nicht

| | Bereitschaft? |
|---|---|
| Standort | **ja** |
| Regeltour | **ja** |
| Tagestour | **ja** (erbt sie von der Regeltour) |
| Container | **nein** |
| Sensor, Bauhof, Benutzerrolle | nein |

**Warum der Container keine bekommt.** Er steht auf einem Platz, und der Platz
gehört zur Bereitschaft. Eine zweite Zuordnung könnte der ersten widersprechen –
Container A der Bereitschaft Nord auf dem Platz der Bereitschaft Süd –, und dann
wäre unklar, welche gilt. Ein Widerspruch, den niemand auflösen kann, ist
schlimmer als eine fehlende Angabe.

**Warum die Tagestour eine bekommt und sie nicht vom Standort ableitet.** Eine
Tour kann Stopps mehrerer Bereitschaften enthalten – etwa bei einer Vertretung.
Wer sie fährt und wer sie plant, ist eine eigene Aussage.

Beim häufigsten Handgriff der Disposition – „aus der Regeltour eine Tour
machen" – wird die Bereitschaft **übernommen**. Ohne das entstünde bei jedem
Klick eine Tour ohne Zuordnung, die anschließend alle ändern dürfen.

---

## 3. Einrichten

### a) Bereitschaften anlegen

*Bereitschaften* (nur Administration). Stammdaten: Name, Ansprechpartner,
Telefon, E-Mail, Bemerkung.

Der Name ist zugleich die Kennung, unter der die Bereitschaft im Haus geführt
wird – zweimal derselbe wäre in jeder Auswahlliste eine Verwechslung und wird
abgelehnt.

### b) Standorte und Regeltouren zuordnen

Zwei Wege, beide führen zum selben Ergebnis:

- **Am Stück**: *Bereitschaften → „Standorte und Touren"*. Die Auswahl ist der
  vollständige neue Stand – was nicht angehakt ist, wird gelöst. Der Weg für
  „diese dreißig Plätze gehören ab jetzt zu Nord".
- **Einzeln**: am Standort selbst (*Bearbeiten → Betreuende Bereitschaft*) und
  an der Regeltour. Der Weg für die einzelne Entscheidung.

### c) Zugänge zuordnen

*Benutzer → Spalte „Bereitschaft"*. Ein Konto darf mehreren Bereitschaften
zugeordnet sein; Urlaubsvertretung ist der Regelfall.

In der Zeile steht, was gilt: „alle – nicht eingeschränkt" heißt, dass dieses
Konto weiterhin alles sieht. Das ist kein Versehen der Anzeige, sondern der
Zustand ohne Zuordnung.

---

## 4. Wo die Trennung greift

| Ort | Wirkung |
|---|---|
| Standortliste | Filter „Bereitschaft"; die Bereitschaft steht an jeder Zeile |
| Standortdetail, Bearbeiten | Zuordnung setzen |
| Touren (Tagesansicht) | Filter; „Neue Tour" legt sie gleich in der gefilterten Bereitschaft an |
| Tourdetail | Bereitschaft ändern |
| Regeltour | Bereitschaft setzen, wird an Tagestouren vererbt |
| Auswertung, Karte, Prognose | folgen automatisch – siehe unten |

**Warum „automatisch".** Die Einschränkung sitzt nicht in der Oberfläche,
sondern in den Zugriffsregeln der Datenbank (`0019_gruppen.sql`). Alle Ansichten
der Anwendung – auch `standort_zustand`, `standort_planung`, `tour_fortschritt`
und die Fälligkeitsrechnung `tourenplanung()` – laufen mit den Rechten des
Aufrufers (`security_invoker`). Was ein Konto nicht sehen darf, kommt in keiner
Abfrage vor, egal welche Seite sie stellt. Eine vergessene Filterzeile in einer
neuen Ansicht kann die Trennung deshalb nicht aufheben.

Die Filter in der Oberfläche sind Bequemlichkeit für Konten, die mehrere
Bereitschaften sehen – nicht der Schutz.

---

## 5. Was passiert, wenn eine Bereitschaft aufgelöst wird

Ihre Standorte, Regeltouren und Touren **bleiben** und fallen in die gemeinsame
Zuständigkeit zurück. Die Zugänge verlieren ihre Zuordnung und sehen damit
wieder alles.

Das Gegenteil – Standorte mit der Bereitschaft zu löschen – wäre ein
Datenverlust aus einem Organisationsschritt heraus.

---

## 6. Geprüft wird das mit

```bash
psql … -f supabase/tests/60_gruppen.sql
```

Neun Prüfungen, alle mit gesetzter Rolle `authenticated` – nur dann greifen die
Zugriffsregeln überhaupt. Geprüft werden unter anderem: die beiden Regeln aus
Abschnitt 1, dass eine fremde Tour sich nicht ändern lässt, dass ein fremder
Standort nicht auf die eigene Tour kommt, und dass eine aufgelöste Bereitschaft
keine Standorte mitnimmt.

Der vollständige Ablauf steht in [supabase/tests/README.md](../supabase/tests/README.md).
