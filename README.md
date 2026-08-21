# Füllstandsüberwachung Altkleidercontainer

Sensoren melden, wie voll die Altkleidercontainer sind. Das Fahrpersonal sieht
daraus eine nach Dringlichkeit sortierte Tourenliste, und die Öffentlichkeit
sieht auf einer Karte ohne Anmeldung, welcher Container noch Platz hat.

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
  (ohne Anmeldung)                 Übersicht · Karte · Tour · Container ·
                                   Sensoren · Import · Benutzer
```

## Was drin ist

**Öffentlich, ohne Anmeldung**
- Karte und Liste aller freigegebenen Container mit Füllstand, Alter der Messung
  und Standzeit; Filter „Noch Platz“; Routenlink ins Navigationsgerät
- dieselben Daten als JSON unter `/api/oeffentlich/container` – zum Einbinden in
  brk-mill.de

**Intern, mit Anmeldung**
- Übersicht mit Kennzahlen und offenen Alarmen
- Karte und Containerliste mit Suche, Filtern und Sortierung
- Containerdetail: Füllstandsverlauf der letzten 30 Tage, Leerungen, Meldungen,
  Kalibrierung
- Tourenliste nach Dringlichkeit oder Entfernung, mit Sammelroute
- Sensorverwaltung samt **Anlernprozess** und druckbarem QR-Etikett
- Import von Containerstammdaten aus der DRK-Dienstleistungsdatenbank (CSV)
- Benutzerverwaltung mit drei Rollen; Passwort-Zurücksetzen ohne Administration

**Automatisch im Hintergrund**
- Füllstand aus Abstand und Kalibrierung, rückwirkend neu gerechnet, wenn sich
  die Kalibrierung ändert
- Leerungserkennung aus dem Verlauf
- Alarme: voll, kein Signal, Batterie schwach – öffnen und schließen sich selbst
- Sendeintervall der Geräte aus der Oberfläche steuerbar, ohne neu zu flashen

## Aufbau

| Verzeichnis | Inhalt |
|---|---|
| `app/` | Next.js (App Router): öffentliche Seiten, interner Bereich, Schnittstellen |
| `components/` | Karte, Verlaufskurve, Füllstandsbalken, Statussymbole, QR-Scanner |
| `lib/` | Supabase-Clients, Rollen, Füllstandslogik, CSV-Leser |
| `supabase/migrations/` | Datenbankschema, Funktionen, Zugriffsschutz |
| `firmware/altkleider-sensor/` | Firmware für ESP32-S3 + SIM7080G + Ultraschall |
| `docs/` | Hardware, Anlernprozess, Schnittstellen, Betrieb |

Technik: Next.js 14 · TypeScript · Tailwind CSS · Supabase (Postgres, Auth,
Row Level Security) · Leaflet mit OpenStreetMap · PlatformIO/Arduino für die
Firmware.

## Schnellstart

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
| [docs/hardware.md](docs/hardware.md) | Stückliste, Verdrahtung, Montage, Stromverbrauch |
| [docs/anlernprozess.md](docs/anlernprozess.md) | Wie Sensor und Container verheiratet werden |
| [docs/api.md](docs/api.md) | Messwertannahme, Provisionierung, öffentliches JSON |
| [docs/betrieb.md](docs/betrieb.md) | Einrichtung, Rollen, Schwellwerte, Datenschutz |
| [docs/dienstleistungsdatenbank.md](docs/dienstleistungsdatenbank.md) | Import heute, Live-Anbindung später |
| [firmware/altkleider-sensor/README.md](firmware/altkleider-sensor/README.md) | Firmware bauen und flashen |

## Sicherheit in Kurzform

- Jedes Gerät signiert seine Messungen mit einem eigenen Schlüssel
  (HMAC-SHA256); der Zeitstempel verhindert das erneute Einspielen
  mitgeschnittener Meldungen.
- Die Gerätegeheimnisse liegen in einer Tabelle **ohne jede Zugriffsregel** –
  auch angemeldete Konten kommen nicht heran, nur der Server.
- Die Zugriffsrechte hängen an Row-Level-Security-Regeln in der Datenbank, nicht
  an der Oberfläche.
- Die öffentliche Ansicht ist eine eigene, bewusst reduzierte Datenbankansicht:
  kein Sensorbezug, keine Batteriewerte, keine Rohabstände, Füllstand auf
  10er-Schritte gerundet.
