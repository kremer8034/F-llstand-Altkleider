-- ============================================================================
-- 0008_rollenschutz.sql
--
-- Zwei Korrekturen am Zugriffsschutz. Beide sind auch in 0002 eingearbeitet;
-- diese Datei ist der Nachtrag für bereits eingerichtete Installationen und
-- schadet beim erneuten Ausführen nicht.
--
-- 1. Die Rolle darf NICHT aus den Anmeldedaten kommen.
--
--    neuen_benutzer_anlegen() hat bisher raw_user_meta_data ->> 'rolle'
--    übernommen. Dieses Feld füllt aber, wer sich anmeldet - bei Supabase Cloud
--    ist die Selbstregistrierung ab Werk offen. Ein einziger Aufruf von
--
--      POST /auth/v1/signup
--      {"email":"…","password":"…","data":{"rolle":"admin"}}
--
--    mit dem öffentlich im Browser stehenden anon-Schlüssel hätte damit ein
--    Administrationskonto erzeugt. Neue Konten bekommen jetzt ausnahmslos
--    'fahrer'; die gewünschte Rolle setzt die Benutzerverwaltung anschließend
--    mit der Service-Role nach (siehe app/intern/benutzer/aktionen.ts).
--
--    Der Sonderfall "allererstes Konto wird Administration" bleibt - ohne ihn
--    käme eine frische Installation nicht in die Benutzerverwaltung hinein.
--    Deshalb gilt weiterhin: Selbstregistrierung abschalten, bevor die Adresse
--    bekannt wird (Authentication → Sign In / Providers → "Allow new users to
--    sign up"). Im Docker-Betrieb erledigt das GOTRUE_DISABLE_SIGNUP.
--
-- 2. Ein Anlerncode ist ein Einmalcode - und wird jetzt auch so behandelt.
--
--    sensor_koppeln() hat verbraucht_am zwar gesetzt, aber nie geprüft. Der
--    Code steht auf dem Aufkleber am Gehäuse und bleibt dort lesbar: er war
--    also dauerhaft weiterverwendbar, obwohl Oberfläche und Etikett das
--    Gegenteil versprechen. Für einen erneuten Anlernvorgang stellt die
--    Sensorverwaltung einen neuen Code aus.
-- ============================================================================

create or replace function public.neuen_benutzer_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rolle  public.benutzerrolle := 'fahrer';
  v_erster boolean;
begin
  -- Der allererste Benutzer wird Administrator, alle weiteren Fahrpersonal.
  -- Die Rolle wird bewusst NICHT aus raw_user_meta_data gelesen: dieses Feld
  -- bestimmt, wer sich anmeldet, nicht wer die Zugänge verwaltet.
  select not exists (select 1 from public.benutzerprofil) into v_erster;

  if v_erster then
    v_rolle := 'admin';
  end if;

  insert into public.benutzerprofil (id, name, email, rolle)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    v_rolle
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create or replace function public.sensor_koppeln(
  p_anlerncode text,
  p_container_id uuid,
  p_gps_lat double precision default null,
  p_gps_lng double precision default null,
  p_ersetzen boolean default false,
  p_notiz text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    'kalibriert', v_container.leer_abstand_mm is not null
  );
end;
$$;

-- create or replace setzt die Ausführungsrechte zurück: PostgreSQL vergibt
-- EXECUTE auf eine neu angelegte Funktion automatisch an PUBLIC. Deshalb hier
-- noch einmal entziehen und gezielt vergeben (siehe 0003/0005).
revoke execute on function public.neuen_benutzer_anlegen() from public, anon, authenticated;
revoke execute on function public.sensor_koppeln(text, uuid, double precision, double precision, boolean, text) from public, anon, authenticated;
grant execute on function public.sensor_koppeln(text, uuid, double precision, double precision, boolean, text) to authenticated;
