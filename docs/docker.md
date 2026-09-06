# Betrieb im eigenen Haus (Docker)

Die Anwendung läuft entweder bei Supabase und Vercel ([betrieb.md](betrieb.md))
oder vollständig auf einem eigenen Server. Dieser Weg beschreibt das Zweite:
alles in Containern, keine Abhängigkeit von einem Anbieter, alle Daten auf der
eigenen Maschine.

---

## Was dabei läuft

```
                        Port 8080
                            │
                   ┌────────▼────────┐
                   │    gateway      │   nginx – ein Einstiegspunkt
                   └──┬──────┬───────┘
        /auth/v1/…    │      │    /rest/v1/…      alles Übrige
             ┌────────▼┐  ┌──▼──────┐        ┌─────────────┐
             │  auth   │  │  rest   │        │     app     │
             │ GoTrue  │  │PostgREST│        │  Next.js    │
             └────┬────┘  └────┬────┘        └──────┬──────┘
                  └────────────┴────────────────────┘
                               │
                        ┌──────▼──────┐
                        │     db      │   PostgreSQL 15
                        └─────────────┘

   dazu: migrate (spielt einmalig das Schema ein) · cron (stündlicher Prüflauf)
   optional: mail (Profil dev) · studio + meta (Profil admin)
```

Web-Oberfläche und Schnittstelle liegen **auf derselben Adresse**. Damit gibt es
kein CORS, nur einen Port nach außen und später nur ein Zertifikat.

---

## Erster Start

Voraussetzung: Docker mit Compose (Docker Desktop oder `docker.io` +
`docker-compose-plugin`), etwa 2 GB Arbeitsspeicher und 5 GB Platte.

```bash
git clone <repository>
cd F-llstand-Altkleider

cp .env.docker.example .env
node scripts/schluessel-erzeugen.mjs >> .env    # Schlüssel und Passwörter
sh scripts/geraete-zertifikate.sh              # Ausweise für die Sensoren

docker compose --profile dev up -d --build
```

Ohne den zweiten Aufruf bleibt der verschlüsselte MQTT-Zugang (8883) zu – die
übrige Anwendung läuft, nur melden dann keine Sensoren
([mqtt.md](mqtt.md)).

Der erste Start dauert ein paar Minuten – Images laden, Anwendung bauen, Schema
einspielen. Danach:

| | |
|---|---|
| Anwendung | http://localhost:8080 |
| Postfach (Profil `dev`) | http://localhost:8025 |
| Datenbankoberfläche (Profil `admin`) | http://localhost:8000 |

Fortschritt mitlesen:

```bash
docker compose logs -f migrate     # Schema wird eingespielt
docker compose logs -f app
docker compose ps                  # alles "running"? migrate muss "exited (0)" sein
```

Ohne Node auf dem Server lassen sich die Schlüssel auch im Container erzeugen:

```bash
docker run --rm -v "$PWD:/w" -w /w node:22-alpine \
  node scripts/schluessel-erzeugen.mjs >> .env
```

### Beispieldaten

`BEISPIELDATEN=ja` in der `.env` **vor dem ersten Start** legt zehn
Beispielcontainer im Landkreis Miltenberg an – gut, um die Oberfläche
kennenzulernen. Später entfernen:

```bash
docker compose exec db psql -U postgres -c "delete from container where nummer like 'DEMO-%';"
```

---

## Erstes Konto

Öffentliche Registrierung ist abgeschaltet (`GOTRUE_DISABLE_SIGNUP=true`), das
erste Konto wird deshalb von Hand angelegt. Es bekommt automatisch die Rolle
*Administration*, alle weiteren werden anschließend in der Oberfläche
eingeladen.

```bash
docker compose exec -T auth sh -c '
  curl -s -X POST http://127.0.0.1:9999/admin/users \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer '"$(grep ^SERVICE_ROLE_KEY .env | cut -d= -f2)"'" \
    -d "{\"email\":\"ihre.adresse@brk-mill.de\",\"password\":\"EinLangesStartpasswort\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"Ihr Name\"}}"
'
```

Danach unter http://localhost:8080/login anmelden und das Passwort über
*Passwort vergessen?* selbst neu setzen.

Prüfen, ob es geklappt hat:

```bash
docker compose exec db psql -U postgres -c "select name, email, rolle from benutzerprofil;"
```

---

## E-Mail

Voreingestellt ist **Mailpit** (Profil `dev`): es fängt alle Mails ab und zeigt
sie unter http://localhost:8025. So lässt sich der Ablauf „Passwort vergessen"
durchspielen, ohne dass etwas nach draußen geht.

Für den echten Betrieb in der `.env` den Hausmailserver eintragen und das Profil
`dev` weglassen:

```env
SMTP_HOST=mail.brk-mill.de
SMTP_PORT=587
SMTP_BENUTZER=fuellstand@brk-mill.de
SMTP_PASSWORT=…
SMTP_ABSENDER=noreply@brk-mill.de
```

```bash
docker compose up -d          # ohne --profile dev
```

Ohne funktionierenden Mailversand können weder Einladungen verschickt noch
Passwörter zurückgesetzt werden.

---

## Erreichbarkeit von außen

Die Sensoren müssen den Server erreichen, und das ausschließlich über HTTPS –
sonst wandern die Messwerte im Klartext durchs Mobilfunknetz.

1. In der `.env` die echte Adresse eintragen:

   ```env
   OEFFENTLICHE_URL=https://fuellstand.brk-mill.de
   ```

2. **Neu bauen** – die Adresse steckt fest im Browser-Bundle:

   ```bash
   docker compose up -d --build
   ```

3. Das Zertifikat holen – siehe nächster Abschnitt.

4. In der Firmware `SERVER_HOST` auf denselben Namen setzen.

> Wer die Adresse ändert und **nicht** neu baut, bekommt eine Oberfläche, die
> weiterhin `http://localhost:8080` anspricht. Das ist der häufigste Stolperstein
> bei diesem Aufbau.

---

## Eigene Adresse mit HTTPS

Ein zusätzlicher Reverse Proxy ist nicht nötig: der Torwächter bringt HTTPS
selbst mit, der Dienst `certbot` hält das Zertifikat gültig. Nur das *erste*
Zertifikat wird von Hand geholt – vorher gibt es keines, und nginx würde einen
443-Block mit fehlenden Dateien nicht annehmen.

**Voraussetzung:** Der A-Record der Adresse zeigt auf diesen Server, und Port 80
ist von außen erreichbar. Let's Encrypt prüft darüber, wem die Adresse gehört.

```bash
# 1. Erst ohne Folgen proben - schützt vor der Ratenbegrenzung
docker compose run --rm --entrypoint certbot certbot certonly \
  --webroot -w /var/www/acme \
  -d altkleider.tech -d www.altkleider.tech \
  --email name@brk.de --agree-tos --no-eff-email --non-interactive --dry-run

# 2. Wenn das durchläuft, dasselbe ohne --dry-run
```

Danach den verschlüsselten Zugang einschalten:

```bash
cp docker/gateway/tls-vorlage/altkleider.conf docker/gateway/tls/
docker compose up -d --force-recreate gateway
```

> `--force-recreate` und nicht `nginx -s reload`: Einzelne eingehängte Dateien
> ersetzen manche Editoren beim Speichern vollständig. Der Container hängt dann
> weiter an der alten Fassung und lädt beim Neuladen unbemerkt nichts Neues.

Die Erneuerung läuft von selbst: `certbot` prüft zweimal täglich, der
Torwächter liest seine Konfiguration alle sechs Stunden neu ein. Der Pfad
`/.well-known/acme-challenge/` bleibt deshalb dauerhaft unverschlüsselt
erreichbar – ohne ihn scheitert jede Erneuerung.

### Was bewusst nicht nach außen zeigt

Sobald der Server eine öffentliche Adresse hat, gilt: alles ohne Anmeldung
gehört auf `127.0.0.1`. Betroffen sind der Mailfänger (8025) und die
Datenbankoberfläche (8000) – beide kennen keinen Passwortschutz. Wer sie sehen
will, baut einen Tunnel:

```bash
ssh -L 8025:127.0.0.1:8025 root@altkleider.tech
```

Offen bleiben nur 80 und 443 sowie **8883** für die Sensoren – der
verschlüsselte MQTT-Zugang. Dort kommt nur herein, wer ein Client-Zertifikat
aus der eigenen Geräte-CA vorweist (`sh scripts/geraete-zertifikate.sh`). Der
unverschlüsselte 1883 hört nur auf `127.0.0.1` und im Docker-Netz;
Einzelheiten in [mqtt.md](mqtt.md).

---

## Sicherung

Alle Nutzdaten liegen im Volume `fuellstand_db-daten`.

```bash
# Sicherung
docker compose exec -T db pg_dump -U postgres --clean --if-exists postgres \
  | gzip > sicherung-$(date +%F).sql.gz

# Rückspielen
gunzip -c sicherung-2026-08-21.sql.gz \
  | docker compose exec -T db psql -U postgres postgres
```

Täglich per Cron auf dem Server, Aufbewahrung nach eigener Regel. **Die `.env`
gehört mit gesichert** – ohne `JWT_SECRET` sind die vorhandenen Anmeldungen
wertlos, und ohne die Gerätegeheimnisse in der Datenbank müssten alle Sensoren
neu provisioniert werden.

---

## Aktualisieren

```bash
git pull
docker compose up -d --build
```

Der `migrate`-Dienst spielt bei jedem Start alle Migrationen ein, die noch
fehlen – jede genau einmal. Was schon gelaufen ist, steht in der Tabelle
`public.schema_migration`. Eine neue Migration braucht deshalb nichts weiter
als die Datei unter `supabase/migrations/` und einen Neustart.

Nachsehen, was eingespielt ist:

```bash
docker compose exec db psql -U postgres \
  -c "select datei, eingespielt_am from public.schema_migration order by datei;"
```

> **Vorsicht bei älteren Anlagen.** Bis September 2026 stand hier eine feste
> Dateiliste, die bei jedem Start lief; alles, was danach dazukam, wurde nie
> eingespielt. Auf einer betroffenen Anlage fehlten zwölf Migrationen – unter
> anderem `sensor.bauart`, die Standorte, die Tourenplanung und die Gruppen.
> Die Oberfläche bot diese Dinge an, die Datenbank kannte sie nicht. Wer eine
> Anlage aus dieser Zeit übernimmt: einmal die Abfrage oben laufen lassen und
> mit dem Inhalt von `supabase/migrations/` vergleichen.

`0004` (Beispieldaten) läuft nur mit `BEISPIELDATEN=ja`. `0006` bleibt außen
vor – den stündlichen Prüflauf übernimmt der Dienst `cron`, nicht pg_cron.

Der Einspieler meldet der Datenschnittstelle anschließend selbst, dass sie ihr
Schema neu lesen soll – ohne das kennt sie neue Tabellen und Spalten nicht.

---

## Wenn etwas klemmt

| Bild | Ursache | Abhilfe |
|---|---|---|
| `migrate` endet mit „auth.users ist nach drei Minuten nicht vorhanden" | Anmeldeverwaltung kam nicht hoch | `docker compose logs auth` – meist stimmt `AUTH_ADMIN_PASSWORT` nicht mit dem überein, was beim allerersten Start gesetzt wurde |
| Anmelden schlägt fehl, Protokoll zeigt „invalid JWT" | `JWT_SECRET` wurde nach dem ersten Start geändert | `ANON_KEY` und `SERVICE_ROLE_KEY` gehören zum Geheimnis – alle drei zusammen neu erzeugen und `--build` |
| Seiten liefern 502 | Anwendung noch nicht fertig gestartet | `docker compose logs app`; der Torwächter fragt den Namensdienst neu ab, ein Neustart ist nicht nötig |
| Listen bleiben leer, obwohl Daten da sind | Datenschnittstelle kennt das Schema noch nicht | `docker compose exec db psql -U postgres -c "notify pgrst, 'reload schema';"` |
| Keine E-Mails | SMTP falsch oder Profil `dev` vergessen | `docker compose logs auth`, Zugangsdaten prüfen |
| Nach `.env`-Änderung passiert nichts | `NEXT_PUBLIC_*` steckt im Bundle | `docker compose up -d --build` |

Ganz von vorn anfangen – **löscht alle Daten**:

```bash
docker compose down -v
docker compose --profile dev up -d --build
```

---

## Ressourcen

Für 300 Container mit vier Meldungen am Tag entstehen rund 1200 Datensätze
täglich, etwa 440.000 im Jahr – für PostgreSQL eine Kleinigkeit. Ein Server mit
zwei Kernen und 4 GB Arbeitsspeicher genügt reichlich; die Datenbank wächst um
grob 100 MB im Jahr.
