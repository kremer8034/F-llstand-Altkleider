# Anbindung der DRK-Dienstleistungsdatenbank

Die Containerstandorte werden heute in der Dienstleistungsdatenbank der
DRK Service GmbH gepflegt und darüber auf brk-mill.de ausgespielt. Ziel ist,
sie **nicht doppelt** zu pflegen.

## Stand jetzt: Import aus dem Export

Umgesetzt ist der Weg über die Exportdatei – der funktioniert ohne Rückfrage bei
Dritten und ist damit sofort nutzbar.

**Intern → Import**, CSV-Datei auswählen oder Inhalt einfügen. Erkannt werden
Semikolon, Komma und Tabulator als Trennzeichen sowie die üblichen
Spaltenbezeichnungen:

| Zielfeld | erkannte Spaltennamen |
|---|---|
| Nummer *(Pflicht)* | Nummer, Containernummer, ContainerNr, Nr, Kennung |
| externe ID | ID, ExterneID, DatensatzID, ObjektID |
| Bezeichnung | Bezeichnung, Standort, Standortbezeichnung, Name |
| Straße | Straße, Straße/Hausnummer, Adresse, Anschrift |
| PLZ / Ort | PLZ, Postleitzahl / Ort, Stadt, Gemeinde |
| Koordinaten | Lat, Latitude, Breitengrad / Lng, Lon, Längengrad |
| Volumen | Volumen, Größe, Fassungsvermögen |
| Aufstelldatum | Aufstelldatum, Aufstellung, seit, aufgestellt am |

Groß- und Kleinschreibung, Umlaute und Leerzeichen sind dabei egal. Zahlen
dürfen deutsch (`49,7042`) oder englisch (`49.7042`) geschrieben sein, Daten als
`12.04.2023` oder `2023-04-12`.

Abgeglichen wird über die **Containernummer**: bekannte Nummern werden
aktualisiert, unbekannte neu angelegt. **Kalibrierung, Status, Sensorzuordnung
und das Häkchen für die öffentliche Karte bleiben unangetastet** – das sind
unsere eigenen Daten, die es in der Dienstleistungsdatenbank nicht gibt.

Vor dem Import zeigt die Oberfläche eine Vorschau mit Trefferzahl und weist auf
Zeilen ohne Nummer oder ohne Koordinaten hin.

## Später: Live-Abruf

Falls die DRK Service GmbH eine Schnittstelle bereitstellt, ist der Umbau klein,
weil der Import schon sauber getrennt liegt:

1. `app/intern/import/aktionen.ts` enthält mit `containerImportieren(zeilen)`
   bereits die gesamte Abgleichlogik – die bleibt unverändert.
2. Neu dazu käme ein Abrufmodul, das die Schnittstelle liest und dieselbe
   Struktur `Importzeile[]` zurückgibt.
3. Ein Zeitgeber – pg_cron in der Datenbank oder ein Cron-Eintrag in einer
   anzulegenden `vercel.json` (analog zu `/api/cron/pruefen`) – ruft das
   nächtlich auf.

Für die Anfrage bei der DRK Service GmbH sind vor allem drei Dinge zu klären:

* Gibt es einen lesenden Zugang (REST/JSON, SOAP, oder wenigstens einen
  automatisiert abrufbaren CSV-Export unter fester Adresse)?
* Wie wird authentifiziert (API-Schlüssel, Basic Auth, OAuth)?
* Welches Feld ist der stabile Schlüssel je Container – trägt der Datensatz eine
  ID, die sich nicht ändert? Die wird in `container.externe_id` gespeichert und
  wäre dann die bessere Abgleichgrundlage als die Nummer.

Bis dahin bleibt der Dateiimport der Weg – er dauert keine zwei Minuten und
lässt sich beliebig oft wiederholen.
