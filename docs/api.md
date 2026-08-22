# Schnittstellen

## POST /api/ingest – Messwerte annehmen

Der einzige Weg, auf dem Messwerte ins System kommen.

### Authentifizierung

Jedes Gerät hat ein eigenes 32-Byte-Geheimnis und signiert damit jede Meldung.
Es gibt keine Passwörter im Gerät und keine Client-Zertifikate.

```
signatur = HMAC-SHA256(geheimnis, "<geraete-id>.<zeitstempel>.<rumpf>")
```

| Kopfzeile | Inhalt |
|---|---|
| `X-Geraet-Id` | Geräte-ID, z. B. `ALT-0042` |
| `X-Zeitstempel` | Unixzeit in Sekunden |
| `X-Signatur` | die Signatur als Kleinbuchstaben-Hex |
| `Content-Type` | `application/json` |

Der Zeitstempel darf höchstens **15 Minuten** von der Serverzeit abweichen. Das
verhindert, dass eine mitgeschnittene Meldung später erneut eingespielt wird.
Verglichen wird laufzeitkonstant, damit sich die Signatur nicht Byte für Byte
erraten lässt.

### Rumpf

```json
{
  "abstand_mm": 812,
  "batterie_v": 3.91,
  "temperatur_c": 14.2,
  "rssi": -91,
  "anlass": "intervall",
  "firmware": "1.0.0",
  "gemessen_am": "2026-08-21T06:00:12Z"
}
```

Alle Felder außer `abstand_mm` sind optional. `anlass` ist eines von
`intervall`, `test`, `taster`, `schwellwert`, `neustart`. Fehlt `gemessen_am`,
gilt der Zeitstempel aus der Kopfzeile.

### Antwort

```json
{ "ok": true, "intervall_minuten": 360, "serverzeit": 1755756012, "angelernt": true }
```

* `intervall_minuten` – der Wunsch des Servers. Die Firmware richtet ihren
  Schlafrhythmus danach; so lässt sich das Intervall aus der Oberfläche ändern,
  ohne neu zu flashen.
* `serverzeit` – Notnagel für Geräte, deren Netz keine Uhrzeit liefert.
* `angelernt` – `false`, solange der Sensor keinem Container zugeordnet ist. Die
  Messung wird trotzdem gespeichert und beim Anlernen nachträglich zugeordnet.

### Statuscodes

| Code | Bedeutung |
|---|---|
| 200 | angenommen (auch bei einer doppelt gesendeten Messung) |
| 400 | Kopfzeilen unvollständig oder Rumpf kein gültiges JSON |
| 401 | Zeitstempel außerhalb des Fensters oder Signatur falsch |
| 403 | Gerät hat noch kein Geheimnis |
| 404 | Geräte-ID unbekannt |
| 413 | Rumpf größer als 4 KB |

Eine **doppelt gesendete Messung ist kein Fehler**: Sensor und Zeitpunkt bilden
zusammen einen eindeutigen Schlüssel, die Wiederholung wird still verworfen und
mit 200 quittiert. Ein Gerät, dessen Antwort unterwegs verloren ging, darf seine
Warteschlange also gefahrlos erneut senden.

### Beispiel mit curl

```bash
GERAET="ALT-0042"
KEY="…64 Hex-Zeichen…"
TS=$(date +%s)
RUMPF='{"abstand_mm":812,"batterie_v":3.91,"rssi":-91,"anlass":"test"}'
SIG=$(printf '%s.%s.%s' "$GERAET" "$TS" "$RUMPF" \
      | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$KEY" -r | cut -d' ' -f1)

curl -X POST https://<ihre-domain>/api/ingest \
  -H "Content-Type: application/json" \
  -H "X-Geraet-Id: $GERAET" \
  -H "X-Zeitstempel: $TS" \
  -H "X-Signatur: $SIG" \
  -d "$RUMPF"
```

---

## POST /api/geraete/registrieren – Erstinbetriebnahme

Holt einmalig das Gerätegeheimnis ab, wenn es nicht mitgeflasht wurde.

```
X-Provisionierung: <GERAETE_PROVISIONIERUNG_SCHLUESSEL>
{ "geraete_id": "ALT-0042", "imei": "…", "iccid": "…", "firmware": "1.0.0" }
```

Antwort `{ "ok": true, "geheimnis": "…" }`. Beim zweiten Versuch für dasselbe
Gerät kommt **409** – der Schlüssel wurde bereits ausgegeben.

---

## GET /api/oeffentlich/container – öffentliche Liste

Ohne Anmeldung abrufbar, `Access-Control-Allow-Origin: *`, eine Minute
zwischengespeichert. Gedacht zum Einbinden in **brk-mill.de**.

```json
{
  "stand": "2026-08-21T08:12:00.000Z",
  "anzahl": 42,
  "container": [
    {
      "id": "…", "nummer": "MIL-014", "bezeichnung": "Netto Parkplatz",
      "strasse": "Miltenberger Str. 22", "plz": "63920", "ort": "Großheubach",
      "lat": 49.7333, "lng": 9.2167,
      "fuellstand_prozent": 90, "stufe": "voll",
      "gemessen_am": "2026-08-21T06:00:12Z", "stunden_seit_messung": 2.2
    }
  ]
}
```

Enthält bewusst **keine** Sensordaten, Batteriewerte, Rohabstände oder
Meldungen, und der Füllstand ist auf 10er-Schritte gerundet. Über die
Datenbankansicht `oeffentliche_container` lässt sich das jederzeit weiter
einschränken; einzelne Container schaltet man über das Häkchen
*„Auf der öffentlichen Karte anzeigen“* aus, die ganze Karte über die
Einstellung `oeffentliche_karte`.

---

## GET /api/cron/pruefen – Überwachung

Legt Alarme für Sensoren an, die zu lange nichts gemeldet haben. Geschützt über
`Authorization: Bearer $CRON_SECRET`. Ist `CRON_SECRET` nicht gesetzt, antwortet
der Endpunkt mit **503** – er ist dann abgeschaltet und nicht etwa offen.

Wer ruft ihn auf?

| Betrieb | Auslöser |
|---|---|
| Supabase + Vercel | **niemand** – dort läuft `pruefe_stille_sensoren()` stündlich direkt in der Datenbank (pg_cron, Migration `0006`). Der Vercel-Hobby-Tarif erlaubt nur einen Cron-Lauf pro Tag und scheidet deshalb aus. |
| Docker | der Dienst `cron` aus `docker-compose.yml`, stündlich |
| von Hand | jederzeit mit `curl -H "Authorization: Bearer $CRON_SECRET" …` |

Der Endpunkt bleibt also nützlich, ist im Vercel-Betrieb aber nicht der Weg,
über den die Überwachung läuft.
