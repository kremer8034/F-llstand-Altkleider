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
$P -f supabase/tests/10_ablauf.sql
$P -c "grant usage on schema auth to anon, authenticated;"
$P -f supabase/tests/20_zugriffsschutz.sql
```

| Datei | Prüft |
|---|---|
| `00_supabase_nachbau.sql` | ersetzt `auth.users`, `auth.uid()` und die Rollen `anon`/`authenticated`, die sonst Supabase mitbringt |
| `10_ablauf.sql` | erster Benutzer wird Administrator · Anlernen inklusive Ablehnung einer Doppelkopplung · Kalibrierung samt Rückrechnung · Füllstands-, Batterie- und Signalalarme · Leerungserkennung · Dublettenschutz · Tourenliste · öffentliche Ansicht · Entkoppeln |
| `20_zugriffsschutz.sql` | Fahrpersonal darf erfassen, aber keine Container anlegen · Gerätegeheimnisse sind für niemanden lesbar · niemand befördert sich selbst · unbekannte Konten sehen nichts · ohne Anmeldung nur die öffentliche Ansicht |

Die Ausgabe wird nicht automatisch verglichen – sie ist zum Lesen gedacht.
Jeder Test meldet über `raise notice`, wenn eine Ablehnung korrekt erfolgt ist;
eine unerwartet erlaubte Aktion bricht mit `FEHLER: …` ab.
