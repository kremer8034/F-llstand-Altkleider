-- ============================================================================
-- 0001_schema.sql
-- Grundschema fuer die Fuellstandsueberwachung von Altkleidercontainern.
-- Auslegung: 50-300 Container, 4 Messungen pro Tag und Sensor.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Aufzaehlungstypen
-- ---------------------------------------------------------------------------
create type public.benutzerrolle as enum ('admin', 'dispo', 'fahrer');

create type public.container_status as enum ('aktiv', 'inaktiv', 'defekt', 'entfernt');

create type public.sensor_status as enum ('neu', 'angelernt', 'wartung', 'defekt', 'ausser_betrieb');

create type public.messanlass as enum ('intervall', 'test', 'taster', 'schwellwert', 'neustart');

create type public.alarmtyp as enum ('fuellstand', 'kein_signal', 'batterie_schwach', 'messfehler');

create type public.leerungsart as enum ('automatisch', 'manuell');

create type public.meldungstyp as enum ('voll', 'beschaedigt', 'vermuellt', 'zugeparkt', 'sonstiges');

-- ---------------------------------------------------------------------------
-- Benutzerprofile (haengen an auth.users)
-- ---------------------------------------------------------------------------
create table public.benutzerprofil (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  email       text,
  rolle       public.benutzerrolle not null default 'fahrer',
  telefon     text,
  aktiv       boolean not null default true,
  angelegt_am timestamptz not null default now(),
  geaendert_am timestamptz not null default now()
);

comment on table public.benutzerprofil is
  'Zusatzdaten und Rolle je Anmeldekonto. Wird beim Registrieren automatisch angelegt.';

-- ---------------------------------------------------------------------------
-- Container (Stammdaten)
-- ---------------------------------------------------------------------------
create table public.container (
  id              uuid primary key default gen_random_uuid(),
  nummer          text not null unique,          -- interne Containernummer, z.B. "MIL-014"
  externe_id      text,                          -- ID aus der DRK-Dienstleistungsdatenbank
  bezeichnung     text,                          -- Standortname, z.B. "Netto Parkplatz"
  strasse         text,
  plz             text,
  ort             text,
  lat             double precision,
  lng             double precision,
  typ             text not null default 'Depotcontainer',
  volumen_liter   integer,
  betreiber       text not null default 'BRK Kreisverband Miltenberg',

  -- Kalibrierung: Abstand Sensor -> Fuellgut in Millimetern
  leer_abstand_mm integer,                       -- gemessener Abstand bei leerem Container
  voll_abstand_mm integer,                       -- Abstand, ab dem 100 % gilt

  status          public.container_status not null default 'aktiv',
  oeffentlich     boolean not null default true, -- auf der oeffentlichen Karte sichtbar
  aufstelldatum   date,
  bemerkung       text,
  angelegt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now(),

  constraint container_kalibrierung_plausibel
    check (
      leer_abstand_mm is null
      or voll_abstand_mm is null
      or leer_abstand_mm > voll_abstand_mm
    ),
  constraint container_koordinaten_plausibel
    check (
      (lat is null and lng is null)
      or (lat between -90 and 90 and lng between -180 and 180)
    )
);

create index container_status_idx on public.container (status);
create index container_ort_idx on public.container (ort);
create index container_externe_id_idx on public.container (externe_id);

comment on column public.container.leer_abstand_mm is
  'Abstand Sensor -> Boden bei leerem Container. Wird beim Anlernen gemessen.';
comment on column public.container.voll_abstand_mm is
  'Abstand Sensor -> Fuellgut, ab dem der Container als 100 % voll gilt.';

-- ---------------------------------------------------------------------------
-- Sensoren (die Box mit Controller, Ultraschallsensor und IoT-SIM)
-- ---------------------------------------------------------------------------
create table public.sensor (
  id                uuid primary key default gen_random_uuid(),
  geraete_id        text not null unique,        -- Aufdruck/QR am Gehaeuse, z.B. "ALT-0042"
  imei              text,
  iccid             text,
  mobilfunkanbieter text,
  hardware_rev      text,
  firmware          text,
  container_id      uuid unique references public.container (id) on delete set null,
  status            public.sensor_status not null default 'neu',

  -- Einbaulage: Abstand Sensorunterkante -> Deckelinnenseite
  montage_offset_mm integer not null default 0,
  -- Sendeintervall in Minuten (Standard: 4x taeglich)
  intervall_minuten integer not null default 360,

  letzte_meldung_am timestamptz,
  batterie_v        numeric(4, 2),
  rssi              integer,
  angelernt_am      timestamptz,
  angelernt_von     uuid references public.benutzerprofil (id) on delete set null,
  bemerkung         text,
  angelegt_am       timestamptz not null default now(),
  geaendert_am      timestamptz not null default now()
);

create index sensor_status_idx on public.sensor (status);
create index sensor_letzte_meldung_idx on public.sensor (letzte_meldung_am);

-- Geheimnisse liegen bewusst in einer eigenen Tabelle ohne jede RLS-Policy:
-- damit kommt ausschliesslich die Service-Role (Server) heran, nie der Browser.
create table public.sensor_geheimnis (
  sensor_id       uuid primary key references public.sensor (id) on delete cascade,
  geheimnis       text not null,                 -- HMAC-Schluessel des Geraets (hex)
  ausgegeben_am   timestamptz,                   -- Zeitpunkt der Provisionierung (TOFU)
  angelegt_am     timestamptz not null default now()
);

comment on table public.sensor_geheimnis is
  'HMAC-Schluessel je Geraet. Kein RLS-Zugriff - nur ueber die Service-Role lesbar.';

-- Einmal-Codes fuer den Anlernvorgang (QR-Aufkleber am Geraet)
create table public.anlerncode (
  id            uuid primary key default gen_random_uuid(),
  sensor_id     uuid not null references public.sensor (id) on delete cascade,
  code          text not null unique,            -- kurz und ablesbar, z.B. "7K4P-2QX9"
  gueltig_bis   timestamptz not null default (now() + interval '365 days'),
  verbraucht_am timestamptz,
  verbraucht_von uuid references public.benutzerprofil (id) on delete set null,
  angelegt_am   timestamptz not null default now()
);

create index anlerncode_sensor_idx on public.anlerncode (sensor_id);

-- Historie der Kopplungen ("Verheiratung" Sensor <-> Container)
create table public.sensor_kopplung (
  id            uuid primary key default gen_random_uuid(),
  sensor_id     uuid not null references public.sensor (id) on delete cascade,
  container_id  uuid not null references public.container (id) on delete cascade,
  gekoppelt_am  timestamptz not null default now(),
  getrennt_am   timestamptz,
  angelernt_von uuid references public.benutzerprofil (id) on delete set null,
  kalibrierung  jsonb not null default '{}'::jsonb,
  gps_lat       double precision,                -- Standort des Handys beim Anlernen
  gps_lng       double precision,
  notiz         text
);

create index sensor_kopplung_sensor_idx on public.sensor_kopplung (sensor_id, gekoppelt_am desc);
create index sensor_kopplung_container_idx on public.sensor_kopplung (container_id, gekoppelt_am desc);

-- Nur eine aktive Kopplung je Sensor
create unique index sensor_kopplung_aktiv_idx
  on public.sensor_kopplung (sensor_id)
  where getrennt_am is null;

-- ---------------------------------------------------------------------------
-- Messungen
-- ---------------------------------------------------------------------------
create table public.messung (
  id                 bigserial primary key,
  sensor_id          uuid not null references public.sensor (id) on delete cascade,
  container_id       uuid references public.container (id) on delete set null,
  gemessen_am        timestamptz not null default now(),
  empfangen_am       timestamptz not null default now(),
  abstand_mm         integer,
  fuellstand_prozent smallint,
  batterie_v         numeric(4, 2),
  temperatur_c       numeric(4, 1),
  rssi               integer,
  anlass             public.messanlass not null default 'intervall',
  gueltig            boolean not null default true,
  roh                jsonb,

  constraint messung_fuellstand_bereich
    check (fuellstand_prozent is null or fuellstand_prozent between 0 and 100)
);

create index messung_sensor_zeit_idx on public.messung (sensor_id, gemessen_am desc);
create index messung_container_zeit_idx on public.messung (container_id, gemessen_am desc);

-- Doppelte Uebertragungen (Retry der Firmware) sollen nichts kaputt machen
create unique index messung_dedup_idx on public.messung (sensor_id, gemessen_am);

-- ---------------------------------------------------------------------------
-- Aktueller Zustand je Container (fuer schnelle Karten-/Listenabfragen)
-- ---------------------------------------------------------------------------
create table public.container_zustand (
  container_id       uuid primary key references public.container (id) on delete cascade,
  sensor_id          uuid references public.sensor (id) on delete set null,
  fuellstand_prozent smallint,
  abstand_mm         integer,
  gemessen_am        timestamptz,
  batterie_v         numeric(4, 2),
  rssi               integer,
  geaendert_am       timestamptz not null default now()
);

create index container_zustand_fuellstand_idx on public.container_zustand (fuellstand_prozent desc);

-- ---------------------------------------------------------------------------
-- Leerungen
-- ---------------------------------------------------------------------------
create table public.leerung (
  id                 uuid primary key default gen_random_uuid(),
  container_id       uuid not null references public.container (id) on delete cascade,
  geleert_am         timestamptz not null default now(),
  fuellstand_vorher  smallint,
  fuellstand_nachher smallint,
  art                public.leerungsart not null default 'manuell',
  erfasst_von        uuid references public.benutzerprofil (id) on delete set null,
  menge_kg           numeric(8, 1),
  notiz              text,
  angelegt_am        timestamptz not null default now()
);

create index leerung_container_zeit_idx on public.leerung (container_id, geleert_am desc);

-- ---------------------------------------------------------------------------
-- Alarme
-- ---------------------------------------------------------------------------
create table public.alarm (
  id             uuid primary key default gen_random_uuid(),
  container_id   uuid references public.container (id) on delete cascade,
  sensor_id      uuid references public.sensor (id) on delete cascade,
  typ            public.alarmtyp not null,
  ausgeloest_am  timestamptz not null default now(),
  wert           numeric(10, 2),
  text           text,
  quittiert_am   timestamptz,
  quittiert_von  uuid references public.benutzerprofil (id) on delete set null,
  geschlossen_am timestamptz
);

create index alarm_offen_idx on public.alarm (typ, geschlossen_am) where geschlossen_am is null;
create index alarm_container_idx on public.alarm (container_id, ausgeloest_am desc);

-- Je Container und Typ nur ein offener Alarm
create unique index alarm_eindeutig_offen_idx
  on public.alarm (container_id, typ)
  where geschlossen_am is null;

-- ---------------------------------------------------------------------------
-- Meldungen (Fahrpersonal meldet Zustand vor Ort)
-- ---------------------------------------------------------------------------
create table public.meldung (
  id           uuid primary key default gen_random_uuid(),
  container_id uuid not null references public.container (id) on delete cascade,
  typ          public.meldungstyp not null default 'sonstiges',
  text         text,
  gemeldet_von uuid references public.benutzerprofil (id) on delete set null,
  gemeldet_am  timestamptz not null default now(),
  erledigt_am  timestamptz
);

create index meldung_container_idx on public.meldung (container_id, gemeldet_am desc);

-- ---------------------------------------------------------------------------
-- Einstellungen (Schwellwerte etc.)
-- ---------------------------------------------------------------------------
create table public.einstellung (
  schluessel   text primary key,
  wert         jsonb not null,
  beschreibung text,
  geaendert_am timestamptz not null default now()
);

insert into public.einstellung (schluessel, wert, beschreibung) values
  ('schwelle_warnung',      '75',   'Ab diesem Fuellstand (%) erscheint der Container in der Tourenliste.'),
  ('schwelle_voll',         '90',   'Ab diesem Fuellstand (%) gilt der Container als voll (Alarm).'),
  ('max_stille_stunden',    '30',   'Ohne Meldung in diesem Zeitraum wird "kein Signal" ausgeloest.'),
  ('batterie_min_v',        '3.4',  'Unterhalb dieser Spannung wird ein Batteriealarm ausgeloest.'),
  ('voll_abstand_anteil',   '0.15', 'Standard: voll_abstand_mm = leer_abstand_mm * dieser Anteil.'),
  ('leerung_erkennung_diff','40',   'Fuellstandssprung (Prozentpunkte) nach unten, der als Leerung gilt.'),
  ('karte_zentrum',         '{"lat": 49.7050, "lng": 9.2530, "zoom": 11}', 'Startausschnitt der Karte.'),
  ('oeffentliche_karte',    'true', 'Oeffentliche Karte ohne Anmeldung freigeschaltet.');
