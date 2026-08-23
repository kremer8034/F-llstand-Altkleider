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
        ▼                                ▼
  Öffentliche Karte                Interner Bereich
  QR-Code am Container             Übersicht · Karte · Tour · Standorte ·
  (ohne Anmeldung)                 Regeltouren · Container · Sensoren ·
                                   Auswertung · Import · Benutzer
```

## Was drin ist

**Öffentlich, ohne Anmeldung**
- Karte und Liste aller freigegebenen Container mit Füllstand, Alter der Messung
  und Standzeit; Filter „Noch Platz“; Routenlink ins Navigationsgerät
- dieselben Daten als JSON unter `/api/oeffentlich/container` – zum Einbinden in
  brk-mill.de
- **QR-Code am Container** (`/container/<Nummer>`): zeigt den Füllstand dieses
  Containers, sortiert die nächstgelegenen mit Platz – die Position bleibt dabei
  auf dem Gerät – und nimmt die Meldung „Container ist voll" entgegen. Das
  druckbare Etikett dazu liegt unter `/intern/container/<id>/etikett`

**Intern, mit Anmeldung**
- Übersicht mit Kennzahlen und offenen Alarmen
- Karte und Containerliste mit Suche, Filtern und Sortierung
- Containerdetail: Füllstandsverlauf der letzten 30 Tage, Leerungen, Meldungen,
  Kalibrierung, **Prognose der nächsten Leerung** und Leerungsrhythmus
- Auswertung: Rangliste aller Container nach Leerungshäufigkeit – mittlerer
  Abstand zwischen zwei Leerungen desselben Containers, Leerungen pro Jahr
- **Standorte**: mehrere Container an einem Platz sind ein Stopp. Zuordnung von
  Hand oder über den CSV-Import, Standorte zusammenführen, freie Restkapazität
  in Litern statt Füllstand je Container
- **Regeltouren**: „jeden zweiten Dienstag" als Wochentag, Wochenabstand und
  Ankerdatum. Daraus der nächste Planbesuch je Standort und die Frage, ob ein
  Stopp bis dahin gedeckt ist
- Tourenliste auf Stopp-Ebene: **Pflicht** (muss heute mit), **Kann** (lohnt
  sich nur bei kleinem Umweg) und **ruht**, jeweils mit Begründung; dazu
  **Umwegkosten in Euro je 100 Liter** gegen den Tourdurchschnitt.
  **Reihenfolge nach kürzester Fahrtstrecke** (Nächster-Nachbar + 2-opt), mit
  Sammelroute für die Navigation
- Sensorverwaltung samt **Anlernprozess** und druckbarem QR-Etikett
- Import von Containerstammdaten aus der DRK-Dienstleistungsdatenbank (CSV)
- Benutzerverwaltung mit drei Rollen; Passwort-Zurücksetzen ohne Administration

**Automatisch im Hintergrund**
- Füllstand aus Abstand und Kalibrierung, rückwirkend neu gerechnet, wenn sich
  die Kalibrierung ändert
- Prognose, wann ein Container die Tourenschwelle und die Vollschwelle erreicht –
  aus dem Anstieg im laufenden Zyklus und dem bisherigen Leerungsrhythmus
- Leerungserkennung aus dem Verlauf
- Alarme: voll, kein Signal, Batterie schwach – öffnen und schließen sich selbst;
  die stündliche Signalprüfung läuft als Datenbank-Job (pg_cron)
- Sendeintervall der Geräte aus der Oberfläche steuerbar, ohne neu zu flashen

## Aufbau

| Verzeichnis | Inhalt |
|---|---|
| `app/` | Next.js (App Router): öffentliche Seiten, interner Bereich, Schnittstellen |
| `components/` | Karte, Verlaufskurve, Füllstandsbalken, Statussymbole, QR-Scanner |
| `lib/` | Supabase-Clients, Rollen, Füllstandslogik, Prognosetexte, Kostenrechnung, Routenoptimierung, CSV-Leser |
| `supabase/migrations/` | Datenbankschema, Funktionen, Zugriffsschutz |
| `firmware/altkleider-sensor/` | Firmware für ESP32-S3 + SIM7080G + Ultraschall |
| `docker/` | Torwächter, Datenbankstart, Schema-Einspieler |
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
| [docs/api.md](docs/api.md) | Messwertannahme, Provisionierung, öffentliches JSON |
| [docs/betrieb.md](docs/betrieb.md) | Einrichtung bei Supabase und Vercel, Rollen, Schwellwerte, Datenschutz |
| [docs/docker.md](docs/docker.md) | Betrieb im eigenen Haus mit Docker |
| [docs/dienstleistungsdatenbank.md](docs/dienstleistungsdatenbank.md) | Import heute, Live-Anbindung später |
| [firmware/altkleider-sensor/README.md](firmware/altkleider-sensor/README.md) | Firmware bauen und flashen |

## Sicherheit in Kurzform

- Jedes Gerät signiert seine Messungen mit einem eigenen Schlüssel
  (HMAC-SHA256); der Zeitstempel verhindert das erneute Einspielen
  mitgeschnittener Meldungen.
- Die Gerätegeheimnisse liegen in einer Tabelle **ohne jede Zugriffsregel** –
  auch angemeldete Konten kommen nicht heran, nur der Server.
- Die Zugriffsrechte hängen an Row-Level-Security-Regeln in der Datenbank, nicht
  an der Oberfläche. Die Rolle eines Kontos setzt ausschließlich die
  Benutzerverwaltung – sie lässt sich nicht beim Anmelden mitgeben.
- Die Selbstregistrierung gehört abgeschaltet: Zugänge legt die Administration
  an. Im Docker-Betrieb ist das voreingestellt, bei Supabase Cloud ist es ein
  Schalter (siehe [docs/betrieb.md](docs/betrieb.md)).
- Die öffentliche Ansicht ist eine eigene, bewusst reduzierte Datenbankansicht:
  kein Sensorbezug, keine Batteriewerte, keine Rohabstände, Füllstand auf
  10er-Schritte gerundet.
