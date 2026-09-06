-- ============================================================================
-- 0022_standorte_im_mittelpunkt.sql
--
-- Der Standort ist die Einheit, der Container nur noch ein Behaelter darin.
--
-- Bisher trug jeder Container eine eigene Anschrift, eigene Koordinaten, ein
-- eigenes Volumen und seine eigene Kalibrierung. Gepflegt wurde das doppelt:
-- einmal am Platz, einmal am Behaelter. 0016 hat die Anschrift bereits zu
-- "Rohdaten aus dem Import" erklaert und den Standort zur gueltigen Quelle
-- gemacht - hier wird die Konsequenz gezogen.
--
-- Was bleibt: der Container als Zaehleinheit. Sensoren sitzen an EINEM
-- Behaelter, nicht am Platz, und nur so lassen sich sechs Kuebel an derselben
-- Adresse auseinanderhalten. Was geht: alles, was der Behaelter doppelt trug.
--
--   Anschrift, Koordinaten   -> stehen am Standort
--   volumen_liter            -> entfaellt; alle Behaelter zaehlen gleich
--   leer_/voll_abstand_mm    -> gehoeren zur Montage, also an den Sensor
--
-- Die Kalibrierung ist der heikelste Teil, deshalb ausfuehrlich:
--
--   messung.abstand_mm       roh, ab Sensorunterkante
--   montage_offset_mm        Versatz Sensorunterkante -> Deckelinnenseite
--   leer_abstand_mm          Deckelinnenseite -> Boden (bisher am Container)
--
-- Gerechnet wird `abstand_mm + montage_offset_mm` gegen leer_abstand_mm
-- (0009, korrigiert in 0021). Die neue Angabe am Sensor ist die EINBAUHOEHE:
-- Sensorunterkante bis Boden bei leerem Behaelter - also genau das, was ein
-- leerer Container roh misst. Daraus folgt
--
--   leer_abstand_mm = einbauhoehe_mm + montage_offset_mm
--
-- und der Vollwert wie bisher als Anteil davon (voll_abstand_anteil, 0.15).
-- Damit steht die Kalibrierung dort, wo sie hingehoert: beim Geraet, das
-- montiert wurde. Haengt der Sensor um, zieht sie mit.
--
-- Ausserdem faellt oeffentliche_container ersatzlos weg - samt der
-- Schnittstelle /api/oeffentlich/container, die darauf sass.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Der Sensor kennt seine Einbauhoehe
-- ---------------------------------------------------------------------------
alter table public.sensor
  add column if not exists einbauhoehe_mm integer;

comment on column public.sensor.einbauhoehe_mm is
  'Abstand Sensorunterkante bis Boden bei leerem Behaelter, in Millimetern. '
  'Der Leerwert der Fuellstandsrechnung ergibt sich daraus plus montage_offset_mm.';

-- Uebernahme aus dem Container, bevor die Spalte dort verschwindet. Der
-- Versatz muss abgezogen werden: am Container stand der Wert ab
-- Deckelinnenseite, am Sensor steht er ab Sensorunterkante.
update public.sensor s
   set einbauhoehe_mm = greatest(1, c.leer_abstand_mm - coalesce(s.montage_offset_mm, 0))
  from public.container c
 where c.id = s.container_id
   and c.leer_abstand_mm is not null
   and s.einbauhoehe_mm is null;

alter table public.sensor
  drop constraint if exists sensor_einbauhoehe_plausibel;
alter table public.sensor
  add constraint sensor_einbauhoehe_plausibel
  check (einbauhoehe_mm is null or (einbauhoehe_mm between 100 and 6000));

-- ---------------------------------------------------------------------------
-- b) Leer- und Vollwert aus dem Sensor
--
-- Eine Funktion statt derselben Rechnung an drei Stellen. Sie ist die einzige
-- Stelle, an der aus der Einbauhoehe ein Leerwert wird.
-- ---------------------------------------------------------------------------
create or replace function public.sensor_kalibrierung(p_sensor_id uuid)
returns table (leer_abstand_mm integer, voll_abstand_mm integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (s.einbauhoehe_mm + coalesce(s.montage_offset_mm, 0))::integer,
    -- Untergrenze wie bisher: ein Vollwert unter 50 mm waere kleiner als die
    -- Messgenauigkeit und liesse den Fuellstand am oberen Ende zappeln.
    greatest(50, round((s.einbauhoehe_mm + coalesce(s.montage_offset_mm, 0))
                       * public.einstellung_zahl('voll_abstand_anteil', 0.15))::integer)
  from public.sensor s
  where s.id = p_sensor_id
    and s.einbauhoehe_mm is not null;
$$;

comment on function public.sensor_kalibrierung is
  'Leer- und Vollwert eines Sensors, abgeleitet aus Einbauhoehe und Montageversatz.';

-- ---------------------------------------------------------------------------
-- c) Die Fuellstandsrechnung nimmt die Werte vom Sensor
--
-- Uebernommen aus dem Stand nach 0009/0021 - geaendert ist nur die Herkunft
-- von Leer- und Vollwert. Die Pruefung des Messbereichs bleibt Wort fuer Wort:
-- sie haengt am GERAET (mess_min_mm/mess_max_mm, 0009) und nicht an einer
-- festen Grenze, und ein gekauftes Geraet mit kleinerem Bereich wuerde sonst
-- Ausreisser als gueltig durchlassen.
-- ---------------------------------------------------------------------------
create or replace function public.messung_vorbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sensor public.sensor%rowtype;
  v_leer   integer;
  v_voll   integer;
begin
  select * into v_sensor from public.sensor where id = new.sensor_id;

  -- Offensichtlich unbrauchbare Messwerte markieren statt verwerfen
  if new.abstand_mm is null
     or new.abstand_mm < coalesce(v_sensor.mess_min_mm, 30)
     or new.abstand_mm > coalesce(v_sensor.mess_max_mm, 6000)
  then
    new.gueltig := false;
    new.fuellstand_prozent := null;
  end if;

  if new.container_id is null then
    new.container_id := v_sensor.container_id;
  end if;

  if new.container_id is null then
    return new; -- Sensor noch nicht angelernt: Messung wird nur protokolliert
  end if;

  if not new.gueltig then
    return new; -- kein Fuellstand aus einem Wert, dem nicht zu trauen ist
  end if;

  -- Der einzige Unterschied zu vorher: die Kalibrierung kommt vom Sensor,
  -- nicht vom Behaelter.
  select k.leer_abstand_mm, k.voll_abstand_mm
    into v_leer, v_voll
    from public.sensor_kalibrierung(new.sensor_id) k;

  if new.fuellstand_prozent is null then
    new.fuellstand_prozent := public.berechne_fuellstand(
      v_leer,
      v_voll,
      new.abstand_mm + coalesce(v_sensor.montage_offset_mm, 0)
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- d) Kalibrieren heisst jetzt: die Einbauhoehe festlegen
--
-- Der Name bleibt, damit die Oberflaeche nicht umlernen muss. Zwei Dinge
-- aendern sich:
--
--   * Geschrieben wird sensor.einbauhoehe_mm statt container.leer_abstand_mm.
--   * p_voll_abstand_mm entfaellt. Der Vollwert war schon vorher fast immer
--     ein Anteil des Leerwerts; als eigene Angabe war er nur eine weitere
--     Stelle, an der zwei Zahlen auseinanderlaufen koennen.
--
-- Alles andere bleibt Wort fuer Wort - besonders das Nachrechnen der bereits
-- gespeicherten Messungen und Zustaende. Ohne das stuende die Historie nach
-- einer Nachkalibrierung auf der alten Skala, waehrend jede neue Messung auf
-- der neuen liegt: eine Kurve mit einem Sprung, den nichts erklaert.
--
-- Beim automatischen Weg wird der Median der rohen Messwerte JETZT NICHT MEHR
-- um den Versatz erhoeht (anders als in 0021): der rohe Abstand eines leeren
-- Behaelters IST die Einbauhoehe. Der Versatz kommt erst dazu, wenn daraus ein
-- Leerwert ab Deckelinnenseite wird - in sensor_kalibrierung.
-- ---------------------------------------------------------------------------
drop function if exists public.container_kalibrieren(uuid, integer, integer);

create or replace function public.container_kalibrieren(
  p_container_id uuid,
  p_einbauhoehe_mm integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sensor_id uuid;
  v_versatz   integer := 0;
  v_hoehe     integer := p_einbauhoehe_mm;
  v_leer      integer;
  v_voll      integer;
  v_fenster   integer := public.einstellung_zahl('kalibrier_fenster_stunden', 6)::integer;
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select id, coalesce(montage_offset_mm, 0)
    into v_sensor_id, v_versatz
    from public.sensor
   where container_id = p_container_id;

  if v_sensor_id is null then
    raise exception 'Container hat keinen angelernten Sensor.' using errcode = 'P0002';
  end if;

  if v_hoehe is null then
    select round(percentile_cont(0.5) within group (order by abstand_mm))::integer
      into v_hoehe
      from (
        select abstand_mm
          from public.messung
         where sensor_id = v_sensor_id
           and gueltig
           and abstand_mm is not null
           and gemessen_am > now() - make_interval(hours => v_fenster)
         order by gemessen_am desc
         limit 5
      ) letzte;

    if v_hoehe is null then
      raise exception
        'Im Fenster von % Stunden liegt keine gueltige Messung vor. Entweder eine Messung des Geraets abwarten oder die Einbauhoehe von Hand in Millimetern eintragen (Sensorunterkante bis Boden).',
        v_fenster
        using errcode = 'P0002';
    end if;
  end if;

  update public.sensor
     set einbauhoehe_mm = v_hoehe,
         geaendert_am   = now()
   where id = v_sensor_id;

  select k.leer_abstand_mm, k.voll_abstand_mm
    into v_leer, v_voll
    from public.sensor_kalibrierung(v_sensor_id) k;

  -- Vorhandene Messungen mit der neuen Kalibrierung nachrechnen.
  update public.messung m
     set fuellstand_prozent = public.berechne_fuellstand(
           v_leer, v_voll, m.abstand_mm + coalesce(s.montage_offset_mm, 0))
    from public.sensor s
   where m.container_id = p_container_id and m.gueltig and s.id = m.sensor_id;

  update public.container_zustand z
     set fuellstand_prozent = public.berechne_fuellstand(
           v_leer, v_voll,
           z.abstand_mm + coalesce(
             (select montage_offset_mm from public.sensor s where s.id = z.sensor_id), 0)),
         geaendert_am = now()
   where z.container_id = p_container_id;

  update public.sensor_kopplung
     set kalibrierung = jsonb_build_object(
           'einbauhoehe_mm', v_hoehe,
           'leer_abstand_mm', v_leer,
           'voll_abstand_mm', v_voll,
           'am', now())
   where container_id = p_container_id and getrennt_am is null;

  return jsonb_build_object(
    'einbauhoehe_mm',    v_hoehe,
    'montage_offset_mm', v_versatz,
    'leer_abstand_mm',   v_leer,
    'voll_abstand_mm',   v_voll);
end;
$$;

comment on function public.container_kalibrieren is
  'Legt die Einbauhoehe des Sensors am Container fest - vorgegeben oder als Median der letzten Messungen - und rechnet die gespeicherten Werte damit nach.';

-- ---------------------------------------------------------------------------
-- e) sensor_koppeln meldet die Kalibrierung anhand des Sensors
--
-- Unveraendert uebernommen bis auf die letzte Zeile: ob ein Container
-- kalibriert ist, steht jetzt am Sensor. Die Funktion ist lang, aber sie hier
-- vollstaendig hinzuschreiben ist ehrlicher, als sie mit einem Kunstgriff
-- teilweise zu aendern - der naechste Leser sieht, was gilt.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sensor_koppeln(p_anlerncode text, p_container_id uuid, p_gps_lat double precision DEFAULT NULL::double precision, p_gps_lng double precision DEFAULT NULL::double precision, p_ersetzen boolean DEFAULT false, p_notiz text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_code      public.anlerncode%rowtype;
  v_sensor    public.sensor%rowtype;
  v_container public.container%rowtype;
  v_alter_sensor uuid;
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  select * into v_code
    from public.anlerncode
   where upper(replace(code, '-', '')) = upper(replace(p_anlerncode, '-', ''));

  if not found then
    raise exception 'Anlerncode unbekannt.' using errcode = 'P0002';
  end if;
  if v_code.gueltig_bis < now() then
    raise exception 'Anlerncode ist abgelaufen.' using errcode = 'P0002';
  end if;
  -- Einmalcode: der Aufkleber bleibt lesbar, der Code gilt trotzdem nur einmal.
  if v_code.verbraucht_am is not null then
    raise exception 'Anlerncode wurde bereits verwendet. Bitte in der Sensorverwaltung einen neuen ausstellen.'
      using errcode = 'P0002';
  end if;

  select * into v_sensor from public.sensor where id = v_code.sensor_id;
  if not found then
    raise exception 'Zum Anlerncode gibt es kein Gerät.' using errcode = 'P0002';
  end if;

  select * into v_container from public.container where id = p_container_id;
  if not found then
    raise exception 'Container nicht gefunden.' using errcode = 'P0002';
  end if;

  -- Sensor haengt schon an einem anderen Container?
  if v_sensor.container_id is not null and v_sensor.container_id <> p_container_id then
    if not p_ersetzen then
      raise exception 'Sensor % ist bereits mit Container % gekoppelt.',
        v_sensor.geraete_id,
        (select nummer from public.container where id = v_sensor.container_id)
        using errcode = 'P0001';
    end if;
    update public.sensor_kopplung set getrennt_am = now()
     where sensor_id = v_sensor.id and getrennt_am is null;
    update public.container_zustand set sensor_id = null where sensor_id = v_sensor.id;
  end if;

  -- Container hat schon einen anderen Sensor?
  select id into v_alter_sensor
    from public.sensor
   where container_id = p_container_id and id <> v_sensor.id;

  if v_alter_sensor is not null then
    if not p_ersetzen then
      raise exception 'Container % hat bereits einen Sensor.', v_container.nummer
        using errcode = 'P0001';
    end if;
    update public.sensor
       set container_id = null, status = 'ausser_betrieb'
     where id = v_alter_sensor;
    update public.sensor_kopplung set getrennt_am = now()
     where sensor_id = v_alter_sensor and getrennt_am is null;
  end if;

  update public.sensor
     set container_id = p_container_id,
         status = 'angelernt',
         angelernt_am = now(),
         angelernt_von = auth.uid()
   where id = v_sensor.id;

  insert into public.sensor_kopplung (sensor_id, container_id, angelernt_von, gps_lat, gps_lng, notiz)
  values (v_sensor.id, p_container_id, auth.uid(), p_gps_lat, p_gps_lng, p_notiz)
  on conflict do nothing;

  update public.anlerncode
     set verbraucht_am = now(), verbraucht_von = auth.uid()
   where id = v_code.id;

  -- Bereits eingegangene Messungen dieses Sensors dem Container zuordnen
  update public.messung
     set container_id = p_container_id
   where sensor_id = v_sensor.id
     and container_id is null
     and gemessen_am > now() - interval '2 hours';

  return jsonb_build_object(
    'sensor_id', v_sensor.id,
    'geraete_id', v_sensor.geraete_id,
    'container_id', p_container_id,
    'container_nummer', v_container.nummer,
    'kalibriert', v_sensor.einbauhoehe_mm is not null
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- f) Die Ansichten, die auf den verschwindenden Spalten sitzen
--
-- oeffentliche_container faellt ERSATZLOS. Sie war die Grundlage von
-- /api/oeffentlich/container; beides wird nicht mehr gebraucht, seit die
-- oeffentliche Seite Plaetze zeigt. Wer die Containerliste nach draussen
-- geben will, baut sie neu - dann aber bewusst.
-- ---------------------------------------------------------------------------
drop view if exists public.oeffentliche_container;
drop view if exists public.oeffentliche_standorte;
-- standort_planung sitzt auf standort_zustand und muss zuerst weichen.
drop view if exists public.standort_planung;
drop view if exists public.standort_zustand;

-- ---------------------------------------------------------------------------
-- g) Der Container verliert, was doppelt war
-- ---------------------------------------------------------------------------
alter table public.container
  drop column if exists strasse,
  drop column if exists plz,
  drop column if exists ort,
  drop column if exists lat,
  drop column if exists lng,
  drop column if exists volumen_liter,
  drop column if exists leer_abstand_mm,
  drop column if exists voll_abstand_mm;

alter table public.container
  drop constraint if exists container_koordinaten_plausibel;

-- ---------------------------------------------------------------------------
-- h) Ohne Platz kein Behaelter
--
-- Ein Container ohne Standort haette nach diesem Umbau keinen Ort mehr - er
-- waere weder auf einer Karte noch in einer Tour zu finden. Falls es welche
-- gibt, bekommen sie einen Sammelplatz statt eines Fehlers: eine Migration,
-- die an fremden Daten scheitert, hilft niemandem.
-- ---------------------------------------------------------------------------
do $$
declare
  v_sammel uuid;
begin
  if exists (select 1 from public.container where standort_id is null) then
    insert into public.standort (name, aktiv, bemerkung)
    values ('Ohne Platz', false,
            'Automatisch angelegt von 0022: hier standen Container ohne Standort. Bitte zuordnen.')
    returning id into v_sammel;

    update public.container set standort_id = v_sammel where standort_id is null;
  end if;
end;
$$;

alter table public.container
  alter column standort_id set not null;

comment on column public.container.standort_id is
  'Pflicht. Der Platz traegt Anschrift und Koordinaten - der Behaelter ist nur die Zaehleinheit darin.';

-- ---------------------------------------------------------------------------
-- i) Das Kuerzel des Platzes
--
-- Containernummern werden nicht mehr getippt, sondern erzeugt. Damit sie am
-- Geraet wiederzufinden sind, brauchen sie einen lesbaren Stamm - "RKL-3"
-- sagt mehr als eine laufende Nummer ueber den ganzen Landkreis.
-- ---------------------------------------------------------------------------
alter table public.standort
  add column if not exists kuerzel text;

create or replace function public.standort_kuerzel_vorschlag(p_name text, p_id uuid default null)
returns text
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_stamm text;
  v_kandidat text;
  v_n integer := 1;
begin
  -- Buchstaben und Ziffern, alles andere raus. Umlaute vorher aufloesen,
  -- damit aus "Grossheubach Netto" nicht "GROSSHEU" mit Sonderzeichen wird.
  v_stamm := upper(translate(coalesce(p_name, ''),
                             'äöüÄÖÜßáàéèíìóòúù',
                             'aouAOUsaeeiioouu'));
  v_stamm := regexp_replace(v_stamm, '[^A-Z0-9]', '', 'g');
  v_stamm := left(v_stamm, 6);
  if v_stamm = '' then v_stamm := 'PLATZ'; end if;

  v_kandidat := v_stamm;
  while exists (
    select 1 from public.standort
     where kuerzel = v_kandidat
       and (p_id is null or id <> p_id)
  ) loop
    v_n := v_n + 1;
    v_kandidat := v_stamm || v_n::text;
  end loop;

  return v_kandidat;
end;
$$;

comment on function public.standort_kuerzel_vorschlag is
  'Freies Kuerzel aus dem Platznamen - Stamm aus Buchstaben und Ziffern, bei Kollision durchnummeriert.';

-- Bestand nachziehen
do $$
declare
  r record;
begin
  for r in select id, name from public.standort where kuerzel is null order by name loop
    update public.standort
       set kuerzel = public.standort_kuerzel_vorschlag(r.name, r.id)
     where id = r.id;
  end loop;
end;
$$;

create unique index if not exists standort_kuerzel_key on public.standort (kuerzel);

comment on column public.standort.kuerzel is
  'Stamm der Containernummern an diesem Platz, z. B. RKL fuer RKL-1 bis RKL-6.';

-- ---------------------------------------------------------------------------
-- j) Container nach Anzahl statt einzeln
--
-- "An diesem Platz stehen sechs Kuebel" ist die Angabe, die jemand vor Ort
-- machen kann. Alles andere - Nummern, Typ, Betreiber - haengt am Platz oder
-- ist Vorgabe.
--
-- Beim Verringern wird NICHT blind geloescht. An container_id haengen acht
-- Fremdschluessel, sechs davon mit ON DELETE CASCADE: ein Loeschen nimmt
-- Messungen, Leerungen, Meldungen und Touren mit. Wer schon gearbeitet hat,
-- wird deshalb stillgelegt (status = 'entfernt') statt entfernt. Nur ein
-- Behaelter, der nie etwas getan hat, verschwindet wirklich.
-- ---------------------------------------------------------------------------
create or replace function public.standort_container_setzen(
  p_standort_id uuid,
  p_anzahl integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kuerzel   text;
  v_aktuell   integer;
  v_neu       integer := 0;
  v_stillgelegt integer := 0;
  v_geloescht integer := 0;
  v_index     integer;
  v_nummer    text;
  r           record;
begin
  if not public.ist_angemeldet() then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;

  if p_anzahl is null or p_anzahl < 0 or p_anzahl > 50 then
    raise exception 'Anzahl muss zwischen 0 und 50 liegen.' using errcode = 'P0001';
  end if;

  select kuerzel into v_kuerzel from public.standort where id = p_standort_id;
  if not found then
    raise exception 'Standort nicht gefunden.' using errcode = 'P0002';
  end if;

  if v_kuerzel is null then
    select public.standort_kuerzel_vorschlag(name, id) into v_kuerzel
      from public.standort where id = p_standort_id;
    update public.standort set kuerzel = v_kuerzel where id = p_standort_id;
  end if;

  select count(*) into v_aktuell
    from public.container
   where standort_id = p_standort_id and status = 'aktiv';

  -- Aufstocken: naechste freie Nummer suchen, nicht einfach weiterzaehlen -
  -- ein stillgelegter RKL-3 blockiert seine Nummer weiterhin.
  while v_aktuell + v_neu < p_anzahl loop
    v_index := 1;
    loop
      v_nummer := v_kuerzel || '-' || v_index::text;
      exit when not exists (select 1 from public.container where nummer = v_nummer);
      v_index := v_index + 1;
    end loop;

    insert into public.container (nummer, standort_id)
    values (v_nummer, p_standort_id);

    v_neu := v_neu + 1;
  end loop;

  -- Abbauen: die zuletzt angelegten zuerst, damit die eingespielten
  -- Behaelter mit Geschichte moeglichst unberuehrt bleiben.
  for r in
    select c.id,
           c.nummer,
           exists (select 1 from public.messung        m where m.container_id = c.id)
        or exists (select 1 from public.leerung        l where l.container_id = c.id)
        or exists (select 1 from public.meldung        g where g.container_id = c.id)
        or exists (select 1 from public.alarm          a where a.container_id = c.id)
        or exists (select 1 from public.tour_container t where t.container_id = c.id)
        or exists (select 1 from public.sensor_kopplung k where k.container_id = c.id)
        or exists (select 1 from public.sensor         s where s.container_id = c.id) as benutzt
      from public.container c
     where c.standort_id = p_standort_id
       and c.status = 'aktiv'
     order by c.angelegt_am desc, c.nummer desc
     limit greatest(0, v_aktuell - p_anzahl)
  loop
    if r.benutzt then
      update public.container
         set status = 'entfernt', geaendert_am = now()
       where id = r.id;
      v_stillgelegt := v_stillgelegt + 1;
    else
      delete from public.container where id = r.id;
      v_geloescht := v_geloescht + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'standort_id',  p_standort_id,
    'kuerzel',      v_kuerzel,
    'vorher',       v_aktuell,
    'nachher',      (select count(*) from public.container
                      where standort_id = p_standort_id and status = 'aktiv'),
    'angelegt',     v_neu,
    'stillgelegt',  v_stillgelegt,
    'geloescht',    v_geloescht
  );
end;
$$;

comment on function public.standort_container_setzen is
  'Setzt die Zahl aktiver Container an einem Platz. Legt fehlende an; ueberzaehlige werden stillgelegt, wenn sie Geschichte haben, sonst geloescht.';

revoke all on function public.standort_container_setzen(uuid, integer) from public, anon;
grant execute on function public.standort_container_setzen(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- k) Die oeffentliche Platzliste rechnet ueber alle Behaelter
--
-- Bisher stand hier die Stufe des LEERSTEN Containers. Das war als Antwort auf
-- "passt meine Tuete hier noch rein" gemeint, fuehrte aber in die Irre, sobald
-- man zwei Plaetze vergleicht:
--
--   Platz A   5 Behaelter voll, einer bei 20 %  ->  zeigte "frei, 20 %"
--   Platz B   10 Behaelter, alle bei 30 %       ->  zeigte "frei, 30 %"
--
-- A sah leerer aus als B, obwohl bei B ein Vielfaches an Platz ist. Gerechnet
-- wird deshalb der Mittelwert ueber den ganzen Platz.
--
-- Das Volumen faellt aus der Rechnung, weil es aus dem Datenmodell faellt: alle
-- Behaelter zaehlen gleich, das arithmetische Mittel ist dann das richtige.
--
-- Wichtig - und frueher falsch: ein nie gemessener Behaelter zaehlt NICHT als
-- leer. coalesce(fuellstand, 0) hat einen frisch aufgestellten Platz als
-- "100 % frei" ausgewiesen. avg() uebergeht NULL von selbst; wie viele Werte
-- fehlen, steht in container_gemessen und darf die Oberflaeche sagen.
-- ---------------------------------------------------------------------------
create view public.oeffentliche_standorte
with (security_invoker = false)
as
with sichtbar as (
  select
    c.standort_id,
    c.id                    as container_id,
    z.fuellstand_prozent    as fuellstand,
    z.gemessen_am
  from public.container c
  left join public.container_zustand z on z.container_id = c.id
  where c.oeffentlich
    and c.status = 'aktiv'
),
je_platz as (
  select
    standort_id,
    count(*)::integer            as container_gesamt,
    count(fuellstand)::integer   as container_gemessen,
    -- Einmal runden, nicht zweimal: erst mitteln, dann auf 10er aufrunden.
    -- Aufrunden statt kaufmaennisch, damit die Anzeige im Zweifel voller
    -- wirkt als die Wirklichkeit und niemand vor einem vollen Platz steht.
    case when count(fuellstand) = 0 then null
         else least(100, ceil(avg(fuellstand) / 10.0) * 10)::smallint
    end                          as belegt,
    max(gemessen_am)             as gemessen_am
  from sichtbar
  group by standort_id
)
select
  st.id                          as standort_id,
  st.name,
  st.strasse,
  st.plz,
  st.ort,
  st.lat,
  st.lng,
  j.container_gesamt,
  j.container_gemessen,
  j.belegt                       as belegt_prozent,
  case when j.belegt is null then null
       else (100 - j.belegt)::smallint
  end                            as freie_prozent,
  public.fuellstand_stufe(j.belegt) as stufe,
  j.gemessen_am,
  case when j.gemessen_am is null then null
       else round(extract(epoch from (now() - j.gemessen_am)) / 3600.0, 1)
  end                            as stunden_seit_messung
from public.standort st
join je_platz j on j.standort_id = st.id
where st.aktiv
  and st.lat is not null
  and st.lng is not null
  and coalesce((select (wert #>> '{}')::boolean from public.einstellung
                 where schluessel = 'oeffentliche_karte'), true);

comment on view public.oeffentliche_standorte is
  'Oeffentliche Platzliste: ein Eintrag je Standort, Belegung als Mittel ueber die gemessenen Behaelter. Grundlage der Startseite und der Seite hinter dem QR-Code.';

grant select on public.oeffentliche_standorte to anon, authenticated;

-- ---------------------------------------------------------------------------
-- l) Der interne Platzzustand ohne Liter
--
-- Die Literrechnung war nur so gut wie das gepflegte Volumen je Behaelter -
-- und das gibt es nicht mehr. Statt mit einem Einheitsvolumen weiterzurechnen
-- und Genauigkeit vorzutaeuschen, die keine ist, steht hier jetzt Prozent.
--
-- Die Umrechnung ist exakt, nicht ungefaehr. Frueher:
--
--   (freie_liter - kapazitaet * reserve/100) / zufluss_liter_je_tag
--
-- Kuerzt man das Volumen heraus - und das darf man, seit alle Behaelter gleich
-- zaehlen - bleibt:
--
--   (freie_prozent - reserve_prozent) / zufluss_prozent_je_tag
--
-- Dieselbe Zahl, ohne die Scheingenauigkeit eines Volumens, das niemand
-- gepflegt hat. Gerechnet wird sie in standort_planung, wo sie hingehoert.
--
-- Der Vorbehalt aus docs/tourenplanung.md gilt unveraendert: volle Behaelter
-- nehmen nichts mehr auf, der gemessene Zufluss ist deshalb eine UNTERGRENZE
-- der echten Nachfrage.
-- ---------------------------------------------------------------------------
create view public.standort_zustand
with (security_invoker = true) as
with werte as (
  select public.einstellung_zahl('standort_reserve_prozent', 20) as reserve_prozent,
         public.einstellung_zahl('schwelle_voll', 90)            as schwelle_voll
),
je_container as (
  select
    c.standort_id,
    c.id                                                        as container_id,
    z.fuellstand_prozent,
    p.rate_prozent_pro_tag,
    s.id is not null                                            as hat_sensor,
    s.einbauhoehe_mm is not null                                as kalibriert
  from public.container c
  left join public.container_zustand z  on z.container_id = c.id
  left join public.container_prognose p on p.container_id = c.id
  left join public.sensor s             on s.container_id = c.id
  where c.status = 'aktiv'
),
-- Seit wann liegt ein Container ueber der Vollschwelle? Gemessen ab der
-- ersten Messung im laufenden Zyklus, die die Schwelle erreicht hat.
voll_seit as (
  select m.container_id, min(m.gemessen_am) as seit
  from public.messung m
  cross join werte w
  left join public.container_rhythmus r on r.container_id = m.container_id
  where m.gueltig
    and m.fuellstand_prozent >= w.schwelle_voll
    and m.gemessen_am > coalesce(r.letzte_leerung_am, now() - interval '90 days')
  group by m.container_id
),
je_platz as (
  select
    jc.standort_id,
    count(jc.container_id)::integer                                as container_gesamt,
    count(*) filter (where jc.hat_sensor)::integer                 as container_mit_sensor,
    count(*) filter (where jc.fuellstand_prozent is null)::integer as container_ohne_wert,
    count(*) filter (where jc.hat_sensor and not jc.kalibriert)::integer as container_unkalibriert,
    count(*) filter (where jc.fuellstand_prozent
                           >= (select schwelle_voll from werte))::integer as container_voll,
    -- Mittel nur ueber die gemessenen: ein Behaelter ohne Wert ist unbekannt,
    -- nicht leer.
    round(avg(jc.fuellstand_prozent), 1)                           as belegt_prozent,
    -- Zufluss: nur Behaelter, die ueberhaupt noch aufnehmen koennen
    round(avg(jc.rate_prozent_pro_tag)
          filter (where coalesce(jc.fuellstand_prozent, 0) < 100), 2) as zufluss_prozent_je_tag,
    max(vs.seit)                                                   as voll_seit
  from je_container jc
  left join voll_seit vs on vs.container_id = jc.container_id
  group by jc.standort_id
)
select
  st.id                                as standort_id,
  st.name,
  st.ort,
  st.aktiv,
  st.lat,
  st.lng,

  coalesce(j.container_gesamt, 0)         as container_gesamt,
  coalesce(j.container_mit_sensor, 0)     as container_mit_sensor,
  coalesce(j.container_ohne_wert, 0)      as container_ohne_wert,
  coalesce(j.container_unkalibriert, 0)   as container_unkalibriert,
  coalesce(j.container_voll, 0)           as container_voll,

  j.belegt_prozent,
  case when j.belegt_prozent is null then null
       else round(100 - j.belegt_prozent, 1)
  end                                     as freie_prozent,
  j.zufluss_prozent_je_tag,


  round(extract(epoch from (now() - j.voll_seit)) / 86400.0, 1) as tage_laengster_voll,

  (select count(*) from public.meldung m
    join public.container c2 on c2.id = m.container_id
   where c2.standort_id = st.id and m.erledigt_am is null) as offene_meldungen
from public.standort st
left join je_platz j on j.standort_id = st.id;

comment on view public.standort_zustand is
  'Interner Zustand je Platz: Belegung als Mittel ueber die gemessenen Behaelter, Zufluss und Restlaufzeit in Prozentpunkten.';

-- ---------------------------------------------------------------------------
-- m) Planung und Tourenvorschlag in Prozent
--
-- Unveraendert bis auf die Einheit: aus tage_bis_reserve in Litern wird
-- dieselbe Zahl in Prozentpunkten (Herleitung siehe oben). Die Regeln, wann
-- ein Platz "pflicht", "kann" oder "ruht" ist, bleiben Wort fuer Wort.
-- ---------------------------------------------------------------------------
create view public.standort_planung
with (security_invoker = true) as
with werte as (
  select public.einstellung_zahl('standort_reserve_prozent', 20) as reserve_prozent,
         public.einstellung_zahl('max_tage_ueber_schwelle', 7)   as max_tage_voll,
         public.einstellung_zahl('tour_vorlauf_tage', 3)         as vorlauf
),
plan as (
  select
    rs.standort_id,
    min(public.route_naechster_termin(r.anker_datum, r.intervall_wochen)) as naechster_besuch,
    min(r.name) filter (
      where public.route_naechster_termin(r.anker_datum, r.intervall_wochen) = (
        select min(public.route_naechster_termin(r2.anker_datum, r2.intervall_wochen))
          from public.route r2
          join public.route_standort rs2 on rs2.route_id = r2.id
         where rs2.standort_id = rs.standort_id and r2.aktiv
      )
    ) as routenname
  from public.route_standort rs
  join public.route r on r.id = rs.route_id
  where r.aktiv
  group by rs.standort_id
)
select
  z.standort_id,
  z.name,
  z.ort,
  z.lat,
  z.lng,
  z.container_gesamt,
  z.container_voll,
  z.container_ohne_wert,
  z.belegt_prozent,
  z.freie_prozent,
  z.zufluss_prozent_je_tag,
  z.tage_laengster_voll,
  z.offene_meldungen,
  p.naechster_besuch as naechster_planbesuch_am,
  p.routenname,
  auf.tage_bis_reserve,
  case when auf.tage_bis_reserve is null then null::date
       else current_date + auf.tage_bis_reserve::integer
  end as reserve_am,
  lage.gedeckt,
  st.zustand,
  st.grund
from public.standort_zustand z
cross join werte w
left join plan p on p.standort_id = z.standort_id
cross join lateral (
  select case
    when z.zufluss_prozent_je_tag is null or z.zufluss_prozent_je_tag <= 0 then null::numeric
    else greatest(0::numeric,
                  (coalesce(z.freie_prozent, 100) - w.reserve_prozent) / z.zufluss_prozent_je_tag)
  end as tage_bis_reserve
) auf
cross join lateral (
  select
    coalesce(z.freie_prozent, 100) < w.reserve_prozent as unter_reserve,
    p.naechster_besuch is not null
      and (auf.tage_bis_reserve is null
           or p.naechster_besuch <= current_date + auf.tage_bis_reserve::integer) as gedeckt
) lage
cross join lateral (
  select
    case
      when z.tage_laengster_voll >= w.max_tage_voll then 'pflicht'
      when z.offene_meldungen > 0 then 'pflicht'
      when lage.unter_reserve and not lage.gedeckt then 'pflicht'
      when not lage.gedeckt and auf.tage_bis_reserve <= w.vorlauf then 'pflicht'
      when lage.unter_reserve then 'kann'
      else 'ruht'
    end as zustand,
    case
      when z.tage_laengster_voll >= w.max_tage_voll then 'zu_lange_voll'
      when z.offene_meldungen > 0 then 'meldung'
      when lage.unter_reserve and not lage.gedeckt then 'ungedeckt'
      when not lage.gedeckt and auf.tage_bis_reserve <= w.vorlauf then 'laeuft_voll'
      when lage.unter_reserve then 'mitnahme'
      else 'ruht'
    end as grund
) st
where z.aktiv;

comment on view public.standort_planung is
  'Planungssicht je Platz: wann die Reserve erreicht ist, ob eine Regeltour das deckt, und was daraus folgt.';

drop function if exists public.tourenplanung();

create or replace function public.tourenplanung()
returns table (
  standort_id             uuid,
  name                    text,
  strasse                 text,
  plz                     text,
  ort                     text,
  zufahrt                 text,
  lat                     double precision,
  lng                     double precision,
  container_gesamt        integer,
  container_voll          integer,
  container_ohne_wert     integer,
  belegt_prozent          numeric,
  freie_prozent           numeric,
  zufluss_prozent_je_tag  numeric,
  tage_laengster_voll     numeric,
  offene_meldungen        bigint,
  tage_bis_reserve        numeric,
  reserve_am              date,
  naechster_planbesuch_am date,
  routenname              text,
  gedeckt                 boolean,
  zustand                 text,
  grund                   text
)
language sql
stable
set search_path = public
as $$
  select
    pl.standort_id,
    pl.name,
    s.strasse,
    s.plz,
    s.ort,
    s.zufahrt,
    pl.lat,
    pl.lng,
    pl.container_gesamt,
    pl.container_voll,
    pl.container_ohne_wert,
    pl.belegt_prozent,
    pl.freie_prozent,
    pl.zufluss_prozent_je_tag,
    pl.tage_laengster_voll,
    pl.offene_meldungen,
    pl.tage_bis_reserve,
    pl.reserve_am,
    pl.naechster_planbesuch_am,
    pl.routenname,
    pl.gedeckt,
    pl.zustand,
    pl.grund
  from public.standort_planung pl
  join public.standort s on s.id = pl.standort_id
  where pl.zustand in ('pflicht', 'kann')
  order by
    case pl.zustand when 'pflicht' then 0 else 1 end,
    pl.tage_bis_reserve nulls first,
    pl.freie_prozent;
$$;

comment on function public.tourenplanung is
  'Vorschlagsliste fuer die naechste Tour: Plaetze mit Zustand pflicht oder kann, dringendste zuerst.';

-- ---------------------------------------------------------------------------
-- n) Vom Aufkleber zum Platz
--
-- Auf dem Behaelter klebt eine Nummer, und die Seite hinter dem QR-Code muss
-- daraus den Platz finden. Mehr braucht sie nicht: angezeigt wird der Zustand
-- des Platzes, nicht der des einzelnen Kuebels. Die Kennung steht mit drin,
-- weil eine Buergermeldung ("der hier ist voll") sich auf genau den Behaelter
-- bezieht, vor dem jemand steht.
--
-- Bewusst ohne Fuellstand: was diese Ansicht liefert, ist eine Zuordnung,
-- keine Messung.
-- ---------------------------------------------------------------------------
create view public.oeffentlicher_behaelter
with (security_invoker = false)
as
select
  c.id,
  c.nummer,
  c.standort_id
from public.container c
join public.standort st on st.id = c.standort_id
where c.oeffentlich
  and c.status = 'aktiv'
  and st.aktiv
  and coalesce((select (wert #>> '{}')::boolean from public.einstellung
                 where schluessel = 'oeffentliche_karte'), true);

comment on view public.oeffentlicher_behaelter is
  'Zuordnung Containernummer -> Platz fuer die Seite hinter dem QR-Code. Ohne Messwerte.';

grant select on public.oeffentlicher_behaelter to anon, authenticated;
