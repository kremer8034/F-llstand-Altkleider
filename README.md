# Füllstandsüberwachung Altkleidercontainer

Sensoren melden, wie voll die Altkleidercontainer sind. Daraus entsteht für das
Fahrpersonal eine Tourenliste – welche Stopps drankommen, entscheiden freie
Restkapazität, Prognose, Regeltour und die Kosten des Umwegs; die Reihenfolge
entscheidet die kürzeste Fahrtstrecke. Die Öffentlichkeit sieht auf einer Karte
ohne Anmeldung, welcher Container noch Platz hat, und kann über einen QR-Code
am Container melden, dass er voll ist.

Entstanden für den **BRK Kreisverband Miltenberg**.

```
   Container mit Ultraschallsensor
            │  4× täglich, NB-IoT / LTE-M, HMAC-signiert
            ▼
      /api/ingest ──▶ Supabase (Postgres)
                        │  Füllstand berechnen, Leerung erkennen, Alarm setzen
                        ▼
        ┌───────────────┴────────────────┐
        ▼                    ▼                        ▼
  Öffentliche Karte   Interner Bereich          Fahreransicht
  QR-Code am          Übersicht · Karte ·       Tour beginnen ·
  Container           Touren · Regeltouren ·    Stopp für Stopp ·
  (ohne Anmeldung)    Standorte · Sensoren ·    Leerung bestätigen
                      Auswertung · Bauhöfe ·    (funklochfest)
                      Benutzer
```

## Was drin ist

**Öffentlich, ohne Anmeldung**
- Karte und Liste aller freigegebenen **Standorte** mit Belegung und Alter der
  Messung; Filter „Noch Platz“; Routenlink ins Navigationsgerät. Ein Eintrag je
  Platz, nicht je Behälter – für den Bürger ist ein Parkplatz mit sechs Kübeln
  eine Anlaufstelle und keine sechs. Die Seite wird bei jedem Aufruf frisch
  gebaut: ein Zwischenspeicher liefert hier den Stand des vorigen Besuchers aus
- **QR-Code am Behälter** (`/container/<Nummer>`): nennt zuerst den nächsten
  Platz mit freier Kapazität, mit Entfernung, Routenknopf und Karte. Der
  Standort wird beim Laden abgefragt, nicht auf Knopfdruck; er bleibt dabei auf
  dem Gerät. Nimmt außerdem die Meldung „Behälter ist voll" entgegen. Das
  druckbare Etikett dazu liegt unter `/intern/container/<id>/etikett`

**Intern, mit Anmeldung**
- Übersicht mit Kennzahlen und offenen Alarmen
- Karte sowie Standortliste mit aufklappbaren Containern, Suche, Filtern und
  Sortierung; dieselbe Seite zeigt auf Wunsch die Containersicht
- Containerdetail: **Verlaufskurven für Füllstand und Batterie** über einen
  wählbaren Zeitraum (7 / 30 / 90 Tage, 1 Jahr) – beide Kurven auf derselben
  Zeitachse, der Zeitraum steht in der Adresse. Dazu Leerungen, Meldungen,
  Kalibrierung, **Prognose der nächsten Leerung** und Leerungsrhythmus
- Auswertung: Rangliste aller Container nach Leerungshäufigkeit – mittlerer
  Abstand zwischen zwei Leerungen desselben Containers, Leerungen pro Jahr
- **Standorte**: mehrere Container an einem Platz sind ein Stopp. Zuordnung von
  Hand oder über den CSV-Import, Standorte zusammenführen, freie Restkapazität
  in Litern statt Füllstand je Container
- **Regeltouren**: „jeden zweiten Dienstag" als Wochentag, Wochenabstand und
  Ankerdatum. Daraus der nächste Planbesuch je Standort und die Frage, ob ein
  Stopp bis dahin gedeckt ist
- **Bereitschaften**: mehrere Dispositionen unter einem Dach. Standorte und
  Touren gehören einer Bereitschaft, und wer ihr zugeordnet ist, sieht und
  plant nur sie – so ändern sich zwei Bereitschaften nicht gegenseitig die
  Fahraufträge. Ohne Zuordnung bleibt alles wie bisher sichtbar
  ([docs/bereitschaften.md](docs/bereitschaften.md))
- **Tagestouren**: ein Fahrauftrag je Tag und Fahrer, mehrere Touren am selben
  Tag möglich. Aus einer Regeltour entsteht mit einem Klick eine Tour samt
  Standorten; Fahrer zuweisen, Stopps aufnehmen und streichen,
  **Reihenfolge nach kürzester Fahrtstrecke** (Nächster-Nachbar + 2-opt), mit
  Sammelroute für die Navigation. Fortschritt der laufenden Touren aus den
  Bestätigungen des Fahrpersonals – ohne Fahrzeugposition
- Fälligkeit auf Stopp-Ebene: **Pflicht** (muss heute mit), **Kann** (lohnt
  sich nur bei kleinem Umweg) und **ruht**, jeweils mit Begründung; dazu
  **Umwegkosten in Euro je 100 Liter** gegen den Tourdurchschnitt
- **Bauhöfe**: wer bei Fremdmüll im Container gerufen wird, je Gemeinde einmal
  gepflegt und am Standort verwiesen. Ohne Eintrag nimmt das Fahrpersonal den
  Müll mit
- Sensorverwaltung samt **Anlernprozess** und druckbarem QR-Etikett
- Import von Containerstammdaten aus der DRK-Dienstleistungsdatenbank (CSV)
- Benutzerverwaltung mit drei Rollen; Passwort-Zurücksetzen ohne Administration

**Fahreransicht (`/fahrer`)**
- Ein Schritt je Bildschirm: Tour beginnen → nächster Stopp mit Zufahrtshinweis
  und Navigationsknopf → vor Ort je Container „geleert" oder „stehen geblieben"
  mit Grund → nächster Stopp → Tour abschließen
- Bei Fremdmüll: Name und Rufnummer des zuständigen Bauhofs, oder der Hinweis,
  dass der Müll mitzunehmen ist
- **Funklochfest**: Bestätigungen liegen bis zum nächsten Netz im Gerät und
  gehen dann selbsttätig raus. Doppelte Leerungen kann es dabei nicht geben –
  die Buchung in der Datenbank ist wiederholbar

**Automatisch im Hintergrund**
- Füllstand aus Abstand und Kalibrierung, rückwirkend neu gerechnet, wenn sich
  die Kalibrierung ändert
- Prognose, wann ein Container die Tourenschwelle und die Vollschwelle erreicht –
  aus dem Anstieg im laufenden Zyklus und dem bisherigen Leerungsrhythmus
- Leerungserkennung aus dem Verlauf
- Meldungen: voll, kein Signal, Batterie schwach, **keine brauchbaren
  Messwerte**, **Sensor verrutscht** und **nichts im Messbereich** (randvoller
  Behälter oder verdeckte Sonde) – öffnen und schließen sich selbst. Die
  Leitlinie: eine ausgefallene Übertragung ist Normalbetrieb, gemeldet wird
  erst, wenn einen ganzen Tag lang nichts Brauchbares ankommt. Die stündliche
  Prüfung läuft im Docker-Betrieb als eigener Dienst (`cron`), bei Vercel als
  Cron-Eintrag ([docs/betrieb.md](docs/betrieb.md), Abschnitt 2b)
- Sendeintervall der Geräte aus der Oberfläche steuerbar, ohne neu zu flashen

## Aufbau

| Verzeichnis | Inhalt |
|---|---|
| `app/` | Next.js (App Router): öffentliche Seiten, interner Bereich, Fahreransicht, Schnittstellen |
| `components/` | Karte, Verlaufskurve, Füllstandsbalken, Statussymbole, QR-Scanner |
| `lib/` | Supabase-Clients, Rollen, Füllstandslogik, Prognosetexte, Kostenrechnung, Routenoptimierung, CSV-Leser, Offline-Warteschlange |
| `supabase/migrations/` | Datenbankschema, Funktionen, Zugriffsschutz |
| `firmware/altkleider-sensor/` | Firmware für ESP32-S3 + SIM7080G + Ultraschall |
| `docker/` | Torwächter, Datenbankstart, Schema-Einspieler, MQTT-Broker und die Brücke zur Anwendung |
| `docs/` | Hardware, Einkaufsliste, Anlernprozess, Schnittstellen, Betrieb |

Technik: Next.js 16 · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres, Auth,
Row Level Security) · Leaflet mit OpenStreetMap · PlatformIO/Arduino für die
Firmware.

## Schnellstart

Es gibt zwei Wege, und beide führen zum selben Ergebnis.

### Alles im eigenen Haus, mit Docker

Datenbank, Anmeldung, Schnittstelle und Web-Oberfläche laufen in Containern auf
einem eigenen Server – ohne Abhängigkeit von einem Anbieter.

```bash
cp .env.docker.example .env
node scripts/schluessel-erzeugen.mjs >> .env
sh scripts/geraete-zertifikate.sh
docker compose --profile dev up -d --build
```

Danach läuft alles unter http://localhost:8080, das Testpostfach unter
http://localhost:8025. Einzelheiten in **[docs/docker.md](docs/docker.md)**.

### Bei Supabase und Vercel

```bash
npm install
cp .env.example .env.local     # Supabase-Zugangsdaten eintragen
npm run dev                    # http://localhost:3000
```

Das Datenbankschema liegt in `supabase/migrations/` und wird der Reihe nach
eingespielt. Die vollständige Einrichtung – Supabase-Projekt, E-Mail-Versand,
Vercel, erstes Konto – steht in **[docs/betrieb.md](docs/betrieb.md)**.

## Dokumentation

| | |
|---|---|
| [docs/sensor-entscheidung.md](docs/sensor-entscheidung.md) | **Vorher lesen:** Eigenbau oder Fertiggerät kaufen? Marktübersicht, Kosten und Empfehlung |
| **[docs/Sensor-Bauanleitung.docx](docs/Sensor-Bauanleitung.docx)** | **Bauanleitung für Anfänger: vom Einkauf bis zum eingebauten Sensor** |
| [docs/hardware.md](docs/hardware.md) | Stückliste, Verdrahtung, Montage, Stromverbrauch |
| [docs/einkaufsliste.md](docs/einkaufsliste.md) | Konkrete Produkte mit Bezugsquellen und Preisübersicht |
| [docs/anlernprozess.md](docs/anlernprozess.md) | Wie Sensor und Container verheiratet werden |
| [docs/prognose.md](docs/prognose.md) | Prognose der nächsten Leerung und Leerungsrhythmus |
| [docs/tourenplanung.md](docs/tourenplanung.md) | Standorte, Kosten je Stopp, Regeltouren, QR-Code für Bürger – Rechenweg und Entscheidungslogik |
| [docs/bereitschaften.md](docs/bereitschaften.md) | Mehrere Dispositionen unter einem Dach: Standorte und Touren je Bereitschaft, Rechte auf Gruppenebene |
| [docs/em400-tld.md](docs/em400-tld.md) | Milesight EM400-TLD (NB-IoT) anbinden – Fertiggerät ohne Lötkolben |
| [docs/api.md](docs/api.md) | Messwertannahme (eigene Firmware und Fertiggeräte), Provisionierung, öffentliches JSON |
| [docs/betrieb.md](docs/betrieb.md) | Einrichtung bei Supabase und Vercel, Rollen, Schwellwerte, Datenschutz |
| [docs/docker.md](docs/docker.md) | Betrieb im eigenen Haus mit Docker |
| [docs/dienstleistungsdatenbank.md](docs/dienstleistungsdatenbank.md) | Import heute, Live-Anbindung später |
| [firmware/altkleider-sensor/README.md](firmware/altkleider-sensor/README.md) | Firmware bauen und flashen |

## Sicherheit in Kurzform

- Jedes Gerät der eigenen Firmware signiert seine Messungen mit einem eigenen
  Schlüssel (HMAC-SHA256); der Zeitstempel verhindert das erneute Einspielen
  mitgeschnittener Meldungen. Fertiggeräte können das nicht und melden über
  einen zweiten, mit einem gemeinsamen Schlüssel geschützten Weg – was das
  bedeutet, steht offen in [docs/em400-tld.md](docs/em400-tld.md).
- Die Gerätegeheimnisse liegen in einer Tabelle **ohne jede Zugriffsregel** –
  auch angemeldete Konten kommen nicht heran, nur der Server.
- Die Zugriffsrechte hängen an Row-Level-Security-Regeln in der Datenbank, nicht
  an der Oberfläche. Die Rolle eines Kontos setzt ausschließlich die
  Benutzerverwaltung – sie lässt sich nicht beim Anmelden mitgeben.
- Dasselbe gilt für die **Bereitschaften**: sieht ein Konto nur seine eigene
  Gruppe, dann nicht, weil eine Seite filtert, sondern weil die Datenbank die
  übrigen Zeilen nicht herausgibt. Eine vergessene Filterzeile in einer neuen
  Ansicht kann die Trennung deshalb nicht aufheben.
- Die Selbstregistrierung gehört abgeschaltet: Zugänge legt die Administration
  an. Im Docker-Betrieb ist das voreingestellt, bei Supabase Cloud ist es ein
  Schalter (siehe [docs/betrieb.md](docs/betrieb.md)).
- Die öffentliche Ansicht ist eine eigene, bewusst reduzierte Datenbankansicht:
  kein Sensorbezug, keine Batteriewerte, keine Rohabstände, Füllstand auf
  10er-Schritte gerundet.
