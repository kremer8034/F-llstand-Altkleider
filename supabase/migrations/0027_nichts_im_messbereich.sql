-- ============================================================================
-- 0027_nichts_im_messbereich.sql
--
-- Eine Meldung, die aus einem Versuch entstanden ist.
--
-- Am 07.09.2026 hat der Betreiber den Sensor gegen 06:51 UTC in eine Tasche
-- gepackt (wenige Zentimeter bis zur Wand), die Tasche ins Auto gelegt, das
-- Geraet dabei mehrfach gedreht und es gegen 07:17 wieder abgelegt. Das
-- Protokoll dieser 24 Minuten ist die Vorlage fuer diese Datei:
--
--   06:50:09   1196 mm   gueltig     - auf dem Tisch
--   06:51:02  65533 mm   ungueltig   - 0xFFFD: "nichts im Messbereich"
--   ...       65533 mm   ungueltig   - 23 Minuten lang, 21 Meldungen
--   07:15:27     96 mm   GUELTIG     - Nahfeld-Unsinn beim Herausnehmen
--   07:16:32     31 mm   GUELTIG     -   "        "        "
--   07:17:33   1465 mm   gueltig     - wieder abgelegt
--
-- Drei Dinge stehen darin:
--
--   1. Ein verdecktes Geraet meldet nicht etwa nichts, sondern 0xFFFD - und
--      zwar ununterbrochen. Genau dieses Bild macht auch ein randvoller
--      Behaelter (Ware direkt vor der Membran), ein in den Behaelter
--      gefallener Sensor und ein zugeklebter Sensor. Bisher wurde das nur
--      still als "ungueltig" abgelegt: die Oberflaeche zeigte weiter den
--      letzten guten Wert, und gemeldet haette es erst der Messfehler nach
--      einem vollen Tag.
--
--   2. Die beiden Werte 96 mm und 31 mm gingen als GUELTIG durch und ergaben
--      100 % Fuellstand. Sie liegen ueber der Blindzone des Geraets (30 mm
--      laut Handbuch, siehe lib/geraetearten.ts) - formal also Messwerte.
--      Deshalb wird hier nicht am Messbereich gedreht: einzelne Ausreisser
--      sollen nicht die Grenze verschieben, sondern an der FOLGE scheitern.
--      Eine Reihe von drei Meldungen uebersteht ein oder zwei solcher Werte
--      nicht als Alarm - aber sie erkennt die 21 Meldungen davor.
--
--   3. Die Lage stand ueber den ganzen Vormittag auf "schief" (Kanal 05,
--      Wert 01) - auch auf dem Tisch, auch im Auto, auch beim Drehen. Sie ist
--      ein ZUSTAND gegenueber der Einbaulage, kein Ereignis. Fuer "ist das
--      Geraet heruntergefallen?" traegt sie deshalb weniger, als es aussieht;
--      der Abstand traegt mehr.
--
-- Was diese Meldung von "Messfehler" (0026) unterscheidet, ist die Ursache -
-- und damit, wer hinfahren muss:
--
--   Abstand da, aber ausserhalb des Bereichs  -> etwas ist VOR dem Sensor
--   gar kein Abstand in der Meldung           -> etwas ist MIT der Meldung
-- ============================================================================

-- ---------------------------------------------------------------------------
-- a) Der Typ
--
-- Zum "add value" im Transaktionsblock siehe 0026: erlaubt, solange der Wert
-- nicht in derselben Transaktion benutzt wird. Die Funktion unten nennt ihn
-- nur im Rumpf.
-- ---------------------------------------------------------------------------
alter type public.alarmtyp add value if not exists 'ausser_messbereich';

-- ---------------------------------------------------------------------------
-- b) Die Schwelle
--
-- Drei Meldungen HINTEREINANDER, nicht drei in einem Zeitfenster. Das ist
-- absichtlich unabhaengig vom Sendeintervall: beim Minutentakt sind es drei
-- Minuten, bei vier Meldungen am Tag ist es die uebernaechste Meldung. In
-- beiden Faellen dieselbe Aussage - "das ist kein Ausreisser mehr".
-- ---------------------------------------------------------------------------
insert into public.einstellung (schluessel, wert, beschreibung)
values (
  'messbereich_meldungen',
  '3'::jsonb,
  'So viele Meldungen mit Abstand hintereinander muessen ausserhalb des Messbereichs liegen, bevor die Anlage "nichts im Messbereich" meldet.'
)
on conflict (schluessel) do nothing;

-- ---------------------------------------------------------------------------
-- c) Nachbereitung einer Messung
--
-- Uebernommen aus 0026. Neu ist ein Abschnitt zwischen Lage und Messfehler.
-- ---------------------------------------------------------------------------
create or replace function public.messung_nachbereiten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vorher            smallint;
  v_schwelle_voll     numeric := public.einstellung_zahl('schwelle_voll', 90);
  v_schwelle_warnung  numeric := public.einstellung_zahl('schwelle_warnung', 75);
  v_batterie_min      numeric := public.einstellung_zahl('batterie_min_v', 3.4);
  v_batterie_min_pro  numeric := public.einstellung_zahl('batterie_min_prozent', 20);
  v_leerung_diff      numeric := public.einstellung_zahl('leerung_erkennung_diff', 40);
  v_lage_grenze       integer := greatest(1, public.einstellung_zahl('lage_meldungen_bis_alarm', 2)::integer);
  v_lage_gesamt       integer;
  v_lage_schief       integer;
  v_bereich_grenze    integer := greatest(1, public.einstellung_zahl('messbereich_meldungen', 3)::integer);
  v_bereich_gesamt    integer;
  v_bereich_daneben   integer;
begin
  -- Sensor-Statuszeile aktualisieren
  update public.sensor
     set letzte_meldung_am = greatest(coalesce(letzte_meldung_am, new.gemessen_am), new.gemessen_am),
         batterie_v = coalesce(new.batterie_v, batterie_v),
         batterie_prozent = coalesce(new.batterie_prozent, batterie_prozent),
         rssi = coalesce(new.rssi, rssi)
   where id = new.sensor_id;

  -- "Kein Signal" ist mit dieser Meldung erledigt. Das gilt ausdruecklich
  -- auch fuer eine unbrauchbare Meldung: das Geraet ist erreichbar, und ob
  -- seine Werte taugen, ist die Frage der Meldungen weiter unten.
  update public.alarm
     set geschlossen_am = now()
   where sensor_id = new.sensor_id and typ = 'kein_signal' and geschlossen_am is null;

  if new.container_id is null then
    return new;
  end if;

  -- --- Schraeglage ---------------------------------------------------------
  --
  -- Ein einzelnes "schief" loest nichts aus. Beim Leeren kippt der Deckel,
  -- beim Nachfuellen ruettelt es, und der EM400 meldet solche Augenblicke
  -- sofort. Erst wenn die letzten Meldungen ALLE schief sagen, hat sich
  -- wirklich etwas geloest.
  if new.lage is not null then
    if new.lage = 'normal' then
      update public.alarm
         set geschlossen_am = now()
       where container_id = new.container_id and typ = 'sensor_lage' and geschlossen_am is null;
    else
      select count(*), count(*) filter (where l.lage <> 'normal')
        into v_lage_gesamt, v_lage_schief
        from (
          select m.lage
            from public.messung m
           where m.sensor_id = new.sensor_id and m.lage is not null
           order by m.gemessen_am desc, m.id desc
           limit v_lage_grenze
        ) l;

      if v_lage_gesamt >= v_lage_grenze and v_lage_schief = v_lage_gesamt then
        insert into public.alarm (container_id, sensor_id, typ, text)
        values (new.container_id, new.sensor_id, 'sensor_lage',
                format('Sensor meldet seit %s Meldungen Schraeglage - Verschraubung pruefen.', v_lage_grenze))
        on conflict do nothing;
      end if;
    end if;
  end if;

  -- --- Nichts im Messbereich -----------------------------------------------
  --
  -- Gezaehlt werden nur Meldungen, die ueberhaupt einen Abstand tragen: eine
  -- Meldung ohne Abstand ist ein anderes Problem (Messfehler) und darf die
  -- Reihe weder ausloesen noch unterbrechen.
  if new.abstand_mm is not null then
    if new.gueltig then
      update public.alarm
         set geschlossen_am = now()
       where container_id = new.container_id and typ = 'ausser_messbereich' and geschlossen_am is null;
    else
      select count(*), count(*) filter (where not b.gueltig)
        into v_bereich_gesamt, v_bereich_daneben
        from (
          select m.gueltig
            from public.messung m
           where m.sensor_id = new.sensor_id and m.abstand_mm is not null
           order by m.gemessen_am desc, m.id desc
           limit v_bereich_grenze
        ) b;

      if v_bereich_gesamt >= v_bereich_grenze and v_bereich_daneben = v_bereich_gesamt then
        insert into public.alarm (container_id, sensor_id, typ, wert, text)
        values (new.container_id, new.sensor_id, 'ausser_messbereich', new.abstand_mm,
                format('%s Meldungen hintereinander ohne Wert im Messbereich (zuletzt %s mm).',
                       v_bereich_grenze, new.abstand_mm))
        on conflict do nothing;
      end if;
    end if;
  end if;

  -- --- Messfehler ----------------------------------------------------------
  --
  -- Geschlossen wird hier, geoeffnet in pruefe_messfehler(). Das ist Absicht:
  -- "es geht wieder" weiss man mit einer einzigen brauchbaren Messung, "es
  -- geht seit einem Tag nicht" erst mit dem Blick auf den ganzen Tag.
  if new.gueltig and new.fuellstand_prozent is not null then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'messfehler' and geschlossen_am is null;
  end if;

  if not new.gueltig then
    return new;
  end if;

  -- Vorherigen Fuellstand merken (fuer die Leerungserkennung)
  select fuellstand_prozent into v_vorher
    from public.container_zustand
   where container_id = new.container_id;

  -- Zustand nur fortschreiben, wenn die Messung neuer ist als die gespeicherte
  insert into public.container_zustand as z (
    container_id, sensor_id, fuellstand_prozent, abstand_mm,
    gemessen_am, batterie_v, batterie_prozent, rssi, lage, geaendert_am
  )
  values (
    new.container_id, new.sensor_id, new.fuellstand_prozent, new.abstand_mm,
    new.gemessen_am, new.batterie_v, new.batterie_prozent, new.rssi, new.lage, now()
  )
  on conflict (container_id) do update
    set sensor_id = excluded.sensor_id,
        fuellstand_prozent = excluded.fuellstand_prozent,
        abstand_mm = excluded.abstand_mm,
        gemessen_am = excluded.gemessen_am,
        batterie_v = excluded.batterie_v,
        batterie_prozent = excluded.batterie_prozent,
        rssi = excluded.rssi,
        lage = coalesce(excluded.lage, z.lage),
        geaendert_am = now()
  where z.gemessen_am is null or excluded.gemessen_am >= z.gemessen_am;

  -- Leerung erkennen: deutlicher Sprung nach unten auf niedrigen Fuellstand
  if v_vorher is not null
     and new.fuellstand_prozent is not null
     and (v_vorher - new.fuellstand_prozent) >= v_leerung_diff
     and new.fuellstand_prozent < 30
  then
    insert into public.leerung (container_id, geleert_am, fuellstand_vorher, fuellstand_nachher, art)
    values (new.container_id, new.gemessen_am, v_vorher, new.fuellstand_prozent, 'automatisch');
  end if;

  -- Fuellstandsalarm oeffnen bzw. schliessen
  if new.fuellstand_prozent >= v_schwelle_voll then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'fuellstand', new.fuellstand_prozent,
            format('Container ist zu %s %% gefuellt.', new.fuellstand_prozent))
    on conflict do nothing;
  elsif new.fuellstand_prozent < v_schwelle_warnung then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'fuellstand' and geschlossen_am is null;
  end if;

  -- Batteriealarm: Volt (Eigenbau) ODER Prozent (Fertiggeraet)
  if new.batterie_v is not null and new.batterie_v < v_batterie_min then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'batterie_schwach', new.batterie_v,
            format('Batteriespannung nur noch %s V.', new.batterie_v))
    on conflict do nothing;
  elsif new.batterie_prozent is not null and new.batterie_prozent < v_batterie_min_pro then
    insert into public.alarm (container_id, sensor_id, typ, wert, text)
    values (new.container_id, new.sensor_id, 'batterie_schwach', new.batterie_prozent,
            format('Batterie nur noch %s %% - Zellen tauschen.', new.batterie_prozent))
    on conflict do nothing;
  elsif new.batterie_v is not null or new.batterie_prozent is not null then
    update public.alarm
       set geschlossen_am = now()
     where container_id = new.container_id and typ = 'batterie_schwach' and geschlossen_am is null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- d) Der Messfehler tritt zurueck, wo es genauer geht
--
-- Haelt der Zustand einen ganzen Tag an, waeren sonst beide Meldungen offen -
-- dieselbe Sache in zwei Formulierungen, und die unschaerfere zuletzt. Wer
-- "nichts im Messbereich" stehen hat, weiss bereits mehr, als der Messfehler
-- sagen koennte.
--
-- Der Rest ist unveraendert aus 0026 uebernommen.
-- ---------------------------------------------------------------------------
create or replace function public.pruefe_messfehler()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stunden numeric := public.einstellung_zahl('messfehler_stunden', 24);
  v_min     integer := greatest(1, public.einstellung_zahl('messfehler_min_meldungen', 3)::integer);
  v_anzahl  integer := 0;
begin
  with fenster as (
    select s.id as sensor_id,
           s.container_id,
           now() - make_interval(mins => greatest(v_stunden * 60, s.intervall_minuten * 3)::integer) as ab
      from public.sensor s
     where s.status = 'angelernt'
       and s.container_id is not null
  ),
  bilanz as (
    select f.sensor_id,
           f.container_id,
           f.ab,
           count(m.id) as meldungen,
           count(m.id) filter (where m.gueltig and m.fuellstand_prozent is not null) as brauchbar
      from fenster f
      left join public.messung m
        on m.sensor_id = f.sensor_id and m.gemessen_am >= f.ab
     group by f.sensor_id, f.container_id, f.ab
  )
  insert into public.alarm (container_id, sensor_id, typ, wert, text)
  select b.container_id, b.sensor_id, 'messfehler', b.meldungen,
         format('%s Meldungen seit %s, keine davon mit brauchbarem Messwert.',
                b.meldungen, to_char(b.ab, 'DD.MM.YYYY HH24:MI'))
    from bilanz b
   where b.meldungen >= v_min
     and b.brauchbar = 0
     and not exists (
       select 1 from public.alarm a
        where a.container_id = b.container_id
          and a.typ = 'ausser_messbereich'
          and a.geschlossen_am is null
     )
  on conflict do nothing;

  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

revoke execute on function public.pruefe_messfehler() from public, anon, authenticated;
