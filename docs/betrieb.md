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
   | `0005_funktionsrechte.sql` | schränkt die Ausführungsrechte der Funktionen ein |
   | `0006_stuendlicher_pruflauf.sql` | stündliche Überwachung stiller Sensoren (pg_cron) |
   | `0007_betriebshof.sql` | optionaler fester Startpunkt der Tourenplanung |
   | `0008_rollenschutz.sql` | Rolle nicht mehr aus den Anmeldedaten, Anlerncode als Einmalcode |

   Mit der Supabase-CLI geht es in einem Rutsch:
   `supabase db push`

3. Unter *Project Settings → API* die drei Werte abholen: Projekt-URL,
   `anon`-Schlüssel und `service_role`-Schlüssel.

### Selbstregistrierung abschalten

**Vor** dem ersten Konto und bevor die Adresse bekannt wird: unter
*Authentication → Sign In / Providers → Email* den Schalter
**„Allow new users to sign up“** ausschalten.

Supabase lässt die Selbstregistrierung ab Werk zu. Sie ist über den
`anon`-Schlüssel erreichbar, und der steht offen im Browser-Bundle – jede
beliebige Person könnte sich also selbst einen Zugang anlegen. Zugänge legt hier
aber die Administration an; einen anderen Weg braucht niemand.

> Die Rolle des Kontos ist davon unabhängig geschützt: sie wird nur von der
> Benutzerverwaltung gesetzt und nicht aus den mitgeschickten Anmeldedaten
> gelesen (Migration `0008`). Ohne diesen Riegel hätte eine Selbstregistrierung
> mit `"data": {"rolle": "admin"}` direkt ein Administrationskonto ergeben.
>
> Im Docker-Betrieb ist das bereits voreingestellt (`GOTRUE_DISABLE_SIGNUP`).

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

Einen Cron-Eintrag braucht Vercel **nicht** – der stündliche Prüflauf läuft in
der Datenbank (siehe nächster Abschnitt). `CRON_SECRET` wird trotzdem gesetzt:
es schützt den Endpunkt `/api/cron/pruefen`, der weiterhin von Hand ausgelöst
werden kann. Ohne gesetztes `CRON_SECRET` antwortet der Endpunkt mit **503** und
ist damit abgeschaltet – er steht nie offen.

---

## 2a. Stündliche Überwachung

Migration `0006` legt mit **pg_cron** einen Job in der Datenbank an, der
stündlich prüft, welcher angelernte Sensor zu lange nichts gemeldet hat:

```sql
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

> **Warum nicht über Vercel Cron?** Der Hobby-Tarif erlaubt dort nur *einen*
> Lauf pro Tag. Bei einer Schwelle von 30 Stunden fiele ein toter Sensor damit
> erst bis zu 54 Stunden nach seiner letzten Meldung auf. pg_cron gehört zu
> Supabase, kostet nichts und kann stündlich. Wer einen Pro-Tarif hat, kann
> stattdessen eine `vercel.json` mit
> `{"crons":[{"path":"/api/cron/pruefen","schedule":"17 * * * *"}]}` anlegen –
> dann aber den Datenbank-Job abschalten:
> `select cron.unschedule('stille-sensoren-pruefen');`

---

## 3. Erstes Konto

Das **erste** Konto, das angelegt wird, bekommt automatisch die Rolle
*Administration* – alle weiteren werden *Fahrpersonal*.

Also: einmal über *Authentication → Users → Add user* in Supabase ein Konto mit
der eigenen Adresse anlegen (oder sich selbst einladen), anmelden, und danach
alle weiteren Zugänge bequem über **Intern → Benutzer** einladen.

> Genau deshalb gehört die Selbstregistrierung schon vorher abgeschaltet (siehe
> Abschnitt 1): wer sonst als Erster auf die frische Instanz stößt, bekommt die
> Administrationsrolle.

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

Die Startseite `/` ist ohne Anmeldung erreichbar und zeigt **einen Eintrag je
Standort** – nicht je Container. Wer eine Tüte wegbringen will, fährt zu einer
Adresse; stehen dort sechs Container, ist das trotzdem eine Anlaufstelle und
keine sechs. Die Unterscheidung Container/Standort ist eine interne Ordnung und
kommt nach außen nicht vor.

Je Platz erscheinen Name, Anschrift, die Stufe des leersten Containers
(*nimmt hier überhaupt noch etwas auf?*), die insgesamt belegte Kapazität und
das Alter der letzten Messung.

Steuern lässt sich das an drei Stellen:

* **je Container**: Häkchen *„Auf der öffentlichen Karte anzeigen“* – ein
  ausgeschalteter Container zählt für seinen Platz nicht mit
* **insgesamt**: Einstellung `oeffentliche_karte` in der Tabelle `einstellung`
* **inhaltlich**: die Datenbankansicht `oeffentliche_standorte` in
  `0018_oeffentliche_standorte_ohne_funktion.sql` – sie legt fest, welche
  Felder überhaupt nach außen gehen

> **Ohne Koordinaten kein Eintrag.** Die Ansicht verlangt `lat` und `lng` am
> Standort; fehlen sie, fällt der Platz samt aller seiner Container aus der
> öffentlichen Seite. Das passierte früher lautlos – die Standortseite im
> internen Bereich weist jetzt darauf hin.

> **Kein öffentliches JSON mehr.** `GET /api/oeffentlich/container` und die
> Ansicht `oeffentliche_container` sind mit 0022 ersatzlos entfallen. Wer die
> Daten wieder nach außen geben will, baut den Endpunkt neu – dann aber bewusst
> und auf Standorten.

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
| `kalibrier_fenster_stunden` | 6 | aus diesem Zeitraum wird der Leerwert gemittelt |
| `leerung_erkennung_diff` | 40 | Sprung nach unten, der als Leerung zählt |
| `leerung_min_abstand_stunden` | 12 | darunter gilt eine zweite Leerung als Korrektur und zählt nicht in den Rhythmus |
| `tour_vorlauf_tage` | 3 | so weit blickt die Tourenplanung voraus |
| `karte_zentrum` | Miltenberg | Startausschnitt der Karte |
| `oeffentliche_karte` | true | öffentliche Karte freigeschaltet |
| `betriebshof` | null | fester Startpunkt der Tour, siehe unten |

Für die Tourenplanung auf Standort-Ebene
([docs/tourenplanung.md](tourenplanung.md)) kommt dazu:

| Schlüssel | Standard | Bedeutung |
|---|---|---|
| `standort_reserve_prozent` | 20 | unter dieser freien Restkapazität gilt ein Standort als anzufahren |
| `max_tage_ueber_schwelle` | 7 | so lange darf ein Container höchstens voll stehen, dann muss der Stopp mit |
| `kosten_pro_km` | 0.80 | Sprit, Verschleiß, Reifen, Wartung |
| `kosten_pro_stunde` | 45.00 | Fahrpersonal einschließlich Nebenkosten |
| `minuten_je_stopp` | 8 | anhalten, aufschließen, sichern |
| `minuten_je_container` | 4 | je Container leeren |
| `durchschnitt_kmh` | 45 | Reisegeschwindigkeit im Flächenlandkreis |
| `meldung_zusammenfassen_stunden` | 6 | Bürgermeldungen am selben Container zählen in diesem Fenster hoch, statt neue Einträge anzulegen |
| `meldung_hoechstzahl` | 25 | Obergrenze für den Zähler einer offenen Bürgermeldung |

**Die Kostensätze sind Vorschlagswerte, keine Messwerte.** Sie bestimmen, welcher
Stopp als „lohnt heute nicht" gekennzeichnet wird – das ist der erste Wert, der
durch die echten Zahlen des Kreisverbands ersetzt gehört.

### Startpunkt der Tour

Die Tourenliste rechnet die Reihenfolge auf die kürzeste Gesamtstrecke. Dafür
braucht sie einen Ausgangspunkt. Unterwegs nimmt das Fahrpersonal den eigenen
Standort; wer die Tour vom Schreibtisch aus plant, hinterlegt besser den
Betriebshof:

```sql
update einstellung
   set wert = '{"name": "Betriebshof Miltenberg", "lat": 49.7042, "lng": 9.2646}'::jsonb
 where schluessel = 'betriebshof';
```

Die Koordinaten bekommt man in Google Maps per Rechtsklick auf den Ort. Wieder
abschalten mit `set wert = 'null'::jsonb`.

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
