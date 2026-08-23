-- ============================================================================
-- 0017_benutzername_ohne_email.sql
--
-- Ein Benutzer ohne E-Mail-Adresse liess sich nicht anlegen.
--
-- neuen_benutzer_anlegen() (0002_funktionen.sql) setzt den Namen so:
--
--     coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
--
-- Fehlen beide - kein Name in den Metadaten UND keine E-Mail -, ergibt das
-- NULL. benutzerprofil.name hat zwar `default ''`, aber ein ausdrueckliches
-- NULL im INSERT setzt den Vorgabewert nicht ein, sondern verletzt die
-- NOT-NULL-Bedingung. Der Ausloeser haengt AFTER INSERT an auth.users, also
-- scheitert damit die ganze Benutzeranlage - mit einem Datenbankfehler, dem
-- man die Ursache nicht ansieht.
--
-- Erreichbar ueber jeden Weg, der ohne E-Mail anlegt: Telefonanmeldung, ein
-- ueber die Verwaltungsschnittstelle angelegtes Konto, ein Testkonto. Der
-- uebliche Einladungsweg dieses Projekts liefert immer eine E-Mail, deshalb
-- ist es bisher niemandem begegnet.
--
-- Behoben wird nur diese eine Zeile; alles Uebrige bleibt wortgleich.
-- Der leere Name ist kein Schoenheitsfehler, sondern genau das, was die
-- Spalte als Vorgabe vorsieht - die Benutzerverwaltung traegt ihn nach.
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
  --
  -- Die Rolle kommt bewusst NICHT aus raw_user_meta_data: dieses Feld fuellt,
  -- wer sich anmeldet. Waere die Selbstregistrierung offen (bei Supabase Cloud
  -- ab Werk der Fall), liesse sich damit ueber /auth/v1/signup ein eigenes
  -- Administrationskonto anlegen. Die gewuenschte Rolle setzt die
  -- Benutzerverwaltung anschliessend mit der Service-Role nach.
  select not exists (select 1 from public.benutzerprofil) into v_erster;

  if v_erster then
    v_rolle := 'admin';
  end if;

  insert into public.benutzerprofil (id, name, email, rolle)
  values (
    new.id,
    -- Der aeussere coalesce ist die Berichtigung: ohne ihn wird der Name NULL,
    -- sobald weder Metadaten noch E-Mail etwas hergeben.
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      ''
    ),
    new.email,
    v_rolle
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

comment on function public.neuen_benutzer_anlegen is
  'Legt beim Registrieren das Benutzerprofil an. Ohne Name und ohne E-Mail bleibt der Name leer, statt die Anlage scheitern zu lassen.';
