# Datenbanktests

Prüfen Schema, Auslöser und Zugriffsschutz gegen ein leeres PostgreSQL 16 –
ohne Supabase-Projekt, ohne Internet. Nützlich vor jeder Schemaänderung.

```bash
# Cluster aufsetzen (einmalig)
initdb -D /tmp/pgtest --auth=trust
pg_ctl -D /tmp/pgtest -o "-p 55432 -k /tmp" -l /tmp/pg.log start

# Migrationen und Tests einspielen
P="psql -h /tmp -p 55432 -d postgres -v ON_ERROR_STOP=1"
$P -f supabase/tests/00_supabase_nachbau.sql
$P -f supabase/migrations/0001_schema.sql
$P -f supabase/migrations/0002_funktionen.sql
$P -f supabase/migrations/0003_rls.sql
$P -f supabase/migrations/0004_beispieldaten.sql
$P -f supabase/migrations/0005_funktionsrechte.sql
$P -f supabase/migrations/0007_betriebshof.sql
$P -f supabase/migrations/0008_rollenschutz.sql
$P -f supabase/migrations/0009_geraetevielfalt.sql
$P -f supabase/migrations/0010_prognose.sql
$P -f supabase/migrations/0011_standorte.sql
$P -f supabase/migrations/0012_regeltouren.sql
$P -f supabase/migrations/0013_buergermeldung.sql
$P -f supabase/migrations/0014_entsorger.sql
$P -f supabase/migrations/0015_touren.sql
$P -f supabase/migrations/0016_adresse_am_standort.sql
$P -f supabase/tests/10_ablauf.sql
$P -f supabase/tests/30_prognose.sql
$P -f supabase/tests/40_standorte.sql
$P -f supabase/tests/50_touren.sql
$P -c "grant usage on schema auth to anon, authenticated;"
$P -f supabase/tests/20_zugriffsschutz.sql
```

`0006_stuendlicher_pruflauf.sql` bleibt außen vor: sie braucht `pg_cron`, das
ein gewöhnliches PostgreSQL nicht mitbringt. Sie legt nur den Zeitplan an und
ändert nichts, was die Tests prüfen.

Die Reihenfolge ist nicht beliebig. `20_zugriffsschutz.sql` läuft zuletzt, weil
die anderen Dateien flächendeckend Tabellenrechte an `anon` vergeben, um die
Zugriffsregeln zu prüfen statt der Rechte.

| Datei | Prüft |
|---|---|
| `00_supabase_nachbau.sql` | ersetzt `auth.users`, `auth.uid()` und die Rollen `anon`/`authenticated`, die sonst Supabase mitbringt |
| `10_ablauf.sql` | erster Benutzer wird Administrator · Anlernen inklusive Ablehnung einer Doppelkopplung · Kalibrierung samt Rückrechnung · Füllstands-, Batterie- und Signalalarme · Leerungserkennung · Dublettenschutz · Tourenplanung · öffentliche Ansicht · Entkoppeln |
| `30_prognose.sql` | Leerungsrhythmus (Mittelwert, Aussondern von Doppelerfassungen) · Prognose aus Messreihe und Historie · vorausschauende Planung und der steuerbare Vorlauf · Auswertungen ohne Anmeldung leer |
| `40_standorte.sql` | das Cluster-Beispiel aus [tourenplanung.md](../../docs/tourenplanung.md) nachgerechnet (17 500 l / 5 125 l / 29,3 %) · Reserve, Deckung durch eine Regeltour und die drei Zustände · offene Meldung überstimmt die Deckung · Container ohne Standort · Bürgermeldung samt Missbrauchsschutz · was `anon` darf |
| `20_zugriffsschutz.sql` | Fahrpersonal darf erfassen, aber keine Container anlegen · Gerätegeheimnisse sind für niemanden lesbar · niemand befördert sich selbst · unbekannte Konten sehen nichts · ohne Anmeldung nur die öffentliche Ansicht |

Die Ausgabe wird nicht automatisch verglichen – sie ist zum Lesen gedacht.
Jeder Test meldet über `raise notice`, wenn eine Ablehnung korrekt erfolgt ist;
eine unerwartet erlaubte Aktion bricht mit `FEHLER: …` ab.
