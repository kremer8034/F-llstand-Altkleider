-- ============================================================================
-- 0005_funktionsrechte.sql
--
-- Nachtrag für Installationen, die vor dieser Korrektur eingerichtet wurden.
-- Bei einer Neuinstallation ist derselbe Inhalt bereits in 0002 und 0003
-- enthalten; das erneute Ausführen schadet nicht.
--
-- Hintergrund: PostgreSQL vergibt EXECUTE auf jede neue Funktion automatisch
-- an PUBLIC. Ein "grant execute ... to authenticated" schränkt deshalb nichts
-- ein. Konkret war dadurch public.tourenliste() über /rest/v1/rpc/tourenliste
-- ohne Anmeldung abrufbar und hätte Standorte, Adressen und Füllstände
-- preisgegeben.
-- ============================================================================

alter function public.fuellstand_stufe(smallint)                     set search_path = public;
alter function public.berechne_fuellstand(integer, integer, integer) set search_path = public;
alter function public.setze_geaendert_am()                           set search_path = public;

-- tourenliste braucht kein SECURITY DEFINER: sie liest nur Tabellen, die
-- bereits eigene Zugriffsregeln haben.
alter function public.tourenliste(smallint) security invoker;

revoke execute on function public.einstellung_zahl(text, numeric)        from public, anon, authenticated;
revoke execute on function public.fuellstand_stufe(smallint)             from public, anon, authenticated;
revoke execute on function public.berechne_fuellstand(integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.setze_geaendert_am()                   from public, anon, authenticated;
revoke execute on function public.aktuelle_rolle()                       from public, anon, authenticated;
revoke execute on function public.ist_admin()                            from public, anon, authenticated;
revoke execute on function public.ist_mindestens_dispo()                 from public, anon, authenticated;
revoke execute on function public.ist_angemeldet()                       from public, anon, authenticated;
revoke execute on function public.neuen_benutzer_anlegen()               from public, anon, authenticated;
revoke execute on function public.messung_vorbereiten()                  from public, anon, authenticated;
revoke execute on function public.messung_nachbereiten()                 from public, anon, authenticated;
revoke execute on function public.leerung_nachbereiten()                 from public, anon, authenticated;
revoke execute on function public.pruefe_stille_sensoren()               from public, anon, authenticated;
revoke execute on function public.tourenliste(smallint)                  from public, anon, authenticated;
revoke execute on function public.sensor_koppeln(text, uuid, double precision, double precision, boolean, text) from public, anon, authenticated;
revoke execute on function public.container_kalibrieren(uuid, integer, integer) from public, anon, authenticated;
revoke execute on function public.sensor_entkoppeln(uuid, text)          from public, anon, authenticated;

grant execute on function public.aktuelle_rolle()          to authenticated;
grant execute on function public.ist_admin()               to authenticated;
grant execute on function public.ist_mindestens_dispo()    to authenticated;
grant execute on function public.ist_angemeldet()          to authenticated;
grant execute on function public.einstellung_zahl(text, numeric) to authenticated;
grant execute on function public.fuellstand_stufe(smallint) to anon, authenticated;
grant execute on function public.tourenliste(smallint) to authenticated;
grant execute on function public.sensor_koppeln(text, uuid, double precision, double precision, boolean, text) to authenticated;
grant execute on function public.container_kalibrieren(uuid, integer, integer) to authenticated;
grant execute on function public.sensor_entkoppeln(uuid, text) to authenticated;
