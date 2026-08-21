# Einrichtung und Betrieb bei Supabase und Vercel

> Wer alles auf einem eigenen Server betreiben möchte, findet den Weg über
> Docker in **[docker.md](docker.md)** – dort läuft dieselbe Anwendung samt
> Datenbank und Anmeldeverwaltung in Containern.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Projekt in der Region
   **Frankfurt (eu-central-1)** anlegen – die Daten bleiben damit in der EU.
2. Unter *SQL Editor* die Dateien aus `supabase/migrations/` **der Reihe nach**
   ausführen:

   | Datei | Inhalt |
   |---|---|
   | `0001_schema.sql` | Tabellen und Aufzählungstypen |
   | `0002_funktionen.sql` | Füllstandsberechnung, Leerungserkennung, Alarme, Anlernen |
   | `0003_rls.sql` | Zugriffsschutz und öffentliche Kartenansicht |
   | `0004_beispieldaten.sql` | *optional*: zehn Beispielcontainer zum Ausprobieren |

   Mit der Supabase-CLI geht es in einem Rutsch:
   `supabase db push`

3. Unter *Project Settings → API* die drei Werte abholen: Projekt-URL,
   `anon`-Schlüssel und `service_role`-Schlüssel.

### E-Mail-Versand

Für Einladungen und das Zurücksetzen von Passwörtern braucht Supabase einen
Mailversand. Der eingebaute Testversand ist stark begrenzt – für den echten
Betrieb unter *Authentication → SMTP Settings* den Mailserver des Kreisverbands
eintragen (Absender z. B. `noreply@brk-mill.de`).

Unter *Authentication → URL Configuration*:

* **Site URL**: die spätere Adresse der Anwendung
* **Redirect URLs**: zusätzlich `https://<ihre-domain>/auth/callback`

Ohne diesen Eintrag laufen die Links aus den E-Mails ins Leere.

---

## 2. Anwendung bereitstellen

Lokal:

```bash
npm install
cp .env.example .env.local     # und ausfüllen
npm run dev
```

Auf Vercel: Repository verbinden, dann unter *Settings → Environment Variables*
eintragen:

| Variable | Wert |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Projekt-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon`-Schlüssel |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role`-Schlüssel – **nur serverseitig** |
| `NEXT_PUBLIC_SITE_URL` | `https://<ihre-domain>` |
| `GERAETE_PROVISIONIERUNG_SCHLUESSEL` | `openssl rand -hex 32` |
| `CRON_SECRET` | frei gewählt, schützt `/api/cron/pruefen` |

Der stündliche Prüflauf ist in `vercel.json` bereits eingetragen und läuft nach
dem ersten Deployment von selbst.

---

## 3. Erstes Konto

Das **erste** Konto, das angelegt wird, bekommt automatisch die Rolle
*Administration* – alle weiteren werden *Fahrpersonal*.

Also: einmal über *Authentication → Users → Add user* in Supabase ein Konto mit
der eigenen Adresse anlegen (oder sich selbst einladen), anmelden, und danach
alle weiteren Zugänge bequem über **Intern → Benutzer** einladen.

### Rollen

| Rolle | Darf |
|---|---|
| **Administration** | alles, inklusive Benutzerverwaltung und Einstellungen |
| **Disposition** | Container und Sensoren pflegen, importieren, Touren planen – keine Benutzerverwaltung |
| **Fahrpersonal** | lesen, Leerungen und Störungen erfassen, Sensoren anlernen |

Die Rechte hängen nicht an der Oberfläche, sondern an den Row-Level-Security-Regeln
der Datenbank. Auch wer die Schnittstelle direkt anspricht, kommt nur an das,
was seine Rolle hergibt.

### Passwort vergessen

Auf der Anmeldeseite über *„Passwort vergessen?“* – die Person bekommt einen
Link und vergibt sich selbst ein neues Passwort. Ein Eingriff der Administration
ist dafür nicht nötig. Aus Datenschutzgründen ist die Rückmeldung immer gleich,
egal ob die Adresse im System steht oder nicht.

---

## 4. Öffentliche Karte

Die Startseite `/` ist ohne Anmeldung erreichbar und zeigt Standort,
Füllstandsstufe, das Alter der letzten Messung und die Standzeit des Containers.

Steuern lässt sich das an drei Stellen:

* **je Container**: Häkchen *„Auf der öffentlichen Karte anzeigen“*
* **insgesamt**: Einstellung `oeffentliche_karte` in der Tabelle `einstellung`
* **inhaltlich**: die Datenbankansicht `oeffentliche_container` in
  `0003_rls.sql` – sie legt fest, welche Felder überhaupt nach außen gehen

Für die Einbindung in brk-mill.de gibt es zusätzlich
`GET /api/oeffentlich/container` als JSON (siehe [api.md](api.md)).

> Solange die Karte noch nicht öffentlich sein soll: `oeffentliche_karte` auf
> `false` setzen. Dann liefert die Ansicht keine Zeilen mehr – ohne dass an der
> Anwendung etwas geändert werden muss.

---

## 5. Schwellwerte und Einstellungen

Tabelle `einstellung`, änderbar nur durch die Administration:

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `schwelle_warnung` | 75 | ab hier erscheint der Container in der Tourenliste |
| `schwelle_voll` | 90 | ab hier gilt er als voll (Alarm) |
| `max_stille_stunden` | 30 | danach „kein Signal“ |
| `batterie_min_v` | 3.4 | darunter Batteriealarm |
| `voll_abstand_anteil` | 0.15 | Vollwert = Leerwert × dieser Anteil |
| `leerung_erkennung_diff` | 40 | Sprung nach unten, der als Leerung zählt |
| `karte_zentrum` | Miltenberg | Startausschnitt der Karte |
| `oeffentliche_karte` | true | öffentliche Karte freigeschaltet |

---

## 6. Datenschutz

* Es werden keine personenbezogenen Daten der Einwerfenden erhoben – gemessen
  wird ein Abstand in Millimetern.
* Personenbezug entsteht nur bei den Beschäftigten: wer eine Leerung erfasst,
  eine Störung meldet oder einen Sensor angelernt hat. Beim Anlernen wird
  zusätzlich der Standort des Telefons gespeichert – als Beleg, dass die Box
  tatsächlich am richtigen Container hängt. Diese Verarbeitung gehört ins
  Verarbeitungsverzeichnis.
* Die öffentliche Ansicht enthält nur Containerstandorte und Füllstände.
* Server und Datenbank stehen in der EU (Supabase Frankfurt, Vercel `fra1`).
* Kartenkacheln kommen von OpenStreetMap; dabei erfährt deren Server die
  IP-Adresse der Besucherinnen und Besucher. Das gehört in die
  Datenschutzerklärung. Wer das vermeiden will, kann einen eigenen Kachelserver
  oder einen Anbieter mit Auftragsverarbeitungsvertrag eintragen – die Stelle
  dafür ist eine einzige Zeile in `components/Karte.tsx`.

---

## 7. Sicherung

Supabase legt automatisch tägliche Sicherungen an (Aufbewahrung je nach Tarif).
Für ein eigenes Abbild:

```bash
supabase db dump --db-url "postgresql://…" -f sicherung.sql
```

Die Gerätegeheimnisse stehen in `sensor_geheimnis` und sind Teil dieser
Sicherung – die Datei gehört entsprechend behandelt.
