import Link from "next/link";
import { notFound } from "next/navigation";
import { Fuellstandsbalken } from "@/components/Fuellstandsbalken";
import { Stufensymbol } from "@/components/Stufensymbol";
import { Prognosekarte } from "@/components/Prognosekarte";
import { Verlaufskurve } from "@/components/Verlaufskurve";
import { Zeitraumwahl } from "@/components/Zeitraumwahl";
import { serverClient } from "@/lib/supabase/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { einstellungen, zahlAusEinstellung } from "@/lib/daten";
import { istFertiggeraet } from "@/lib/geraetearten";
import { STUFEN, adresse, alterText, formatDatum, formatDatumZeit, stufeVon } from "@/lib/fuellstand";
import { MESSPUNKTE, zeitraumText, zeitraumVon } from "@/lib/zeitraum";
import type {
  Alarm,
  Container,
  ContainerPrognose,
  ContainerRhythmus,
  ContainerZustand,
  Leerung,
  Messreihenpunkt,
  Sensor,
} from "@/lib/typen";
import { Erfassungsbereich } from "./Erfassungsbereich";
import { alarmQuittieren, kalibrieren, meldungErledigen } from "../aktionen";

export const dynamic = "force-dynamic";

const MELDUNG_TEXT: Record<string, string> = {
  voll: "Container ist voll",
  beschaedigt: "Beschädigt",
  vermuellt: "Vermüllt / Fremdmüll",
  zugeparkt: "Zugeparkt / nicht erreichbar",
  sonstiges: "Sonstiges",
};

export default async function Containerdetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zeitraum?: string }>;
}) {
  const { id } = await params;
  const { zeitraum: gewaehlt } = await searchParams;
  const supabase = await serverClient();
  const benutzer = await angemeldeterBenutzer();

  const { data: container } = await supabase
    .from("container")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!container) notFound();
  const c = container as Container;

  // Der Zeitraum steht in der Adresse, damit er das Neuladen ueberlebt und
  // sich verschicken laesst. "bis" wird einmal festgehalten: beide Kurven
  // sollen auf dieselbe Sekunde enden, nicht auf zwei getrennte now().
  const zeitraum = zeitraumVon(gewaehlt);
  const bis = new Date();
  const von = new Date(bis.getTime() - zeitraum.tage * 86400_000);

  const [
    zustandAntwort,
    sensorAntwort,
    messreiheAntwort,
    leerungImZeitraumAntwort,
    leerungAntwort,
    meldungAntwort,
    alarmAntwort,
    prognoseAntwort,
    rhythmusAntwort,
    werte,
  ] = await Promise.all([
      supabase.from("container_zustand").select("*").eq("container_id", c.id).maybeSingle(),
      supabase.from("sensor").select("*").eq("container_id", c.id).maybeSingle(),
      // Nicht die Rohmessungen: public.messreihe() mittelt sie auf eine feste
      // Punktzahl herunter. Ein Jahr im Minutentakt sind rund 500.000 Zeilen -
      // die will hier weder der Browser noch die Leitung.
      supabase.rpc("messreihe", {
        p_container_id: c.id,
        p_von: von.toISOString(),
        p_bis: bis.toISOString(),
        p_punkte: MESSPUNKTE,
      }),
      // Leerungen im gewaehlten Fenster - nur fuer die Markierungen unter der
      // Kurve. Die Tabelle weiter unten hat ihre eigene Abfrage, weil sie die
      // letzten zwanzig zeigt und nicht die des Zeitraums.
      supabase
        .from("leerung")
        .select("geleert_am")
        .eq("container_id", c.id)
        .gte("geleert_am", von.toISOString())
        .lte("geleert_am", bis.toISOString())
        .order("geleert_am", { ascending: true }),
      supabase
        .from("leerung")
        .select("*")
        .eq("container_id", c.id)
        .order("geleert_am", { ascending: false })
        .limit(20),
      supabase
        .from("meldung")
        .select("*")
        .eq("container_id", c.id)
        .order("gemeldet_am", { ascending: false })
        .limit(20),
      supabase
        .from("alarm")
        .select("*")
        .eq("container_id", c.id)
        .is("geschlossen_am", null)
        .order("ausgeloest_am", { ascending: false }),
      supabase.from("container_prognose").select("*").eq("container_id", c.id).maybeSingle(),
      supabase.from("container_rhythmus").select("*").eq("container_id", c.id).maybeSingle(),
      einstellungen(supabase),
    ]);

  // Standort samt Geschwisterzahl - zeigt sofort, ob der Container allein steht
  // oder Teil eines Clusters ist, der gemeinsam angefahren wird.
  const { data: standort } = c.standort_id
    ? await supabase
        .from("standort_zustand")
        .select("standort_id, name, ort, lat, lng, container_gesamt, freie_prozent")
        .eq("standort_id", c.standort_id)
        .maybeSingle()
    : { data: null };

  const zustand = zustandAntwort.data as ContainerZustand | null;
  const sensor = sensorAntwort.data as Sensor | null;
  const messreihe = (messreiheAntwort.data ?? []) as Messreihenpunkt[];
  const leerungenImZeitraum = ((leerungImZeitraumAntwort.data ?? []) as { geleert_am: string }[])
    .map((l) => l.geleert_am);
  const leerungen = (leerungAntwort.data ?? []) as Leerung[];
  const meldungen = (meldungAntwort.data ?? []) as { id: string; typ: string; text: string | null; gemeldet_am: string; erledigt_am: string | null }[];
  const alarme = (alarmAntwort.data ?? []) as Alarm[];
  const prognose = prognoseAntwort.data as ContainerPrognose | null;
  const rhythmus = rhythmusAntwort.data as ContainerRhythmus | null;

  const kalibrierFenster = zahlAusEinstellung(werte, "kalibrier_fenster_stunden", 6);
  const schwelleVoll = zahlAusEinstellung(werte, "schwelle_voll", 90);
  const schwelleTour = zahlAusEinstellung(werte, "schwelle_warnung", 75);
  const batterieMinProzent = zahlAusEinstellung(werte, "batterie_min_prozent", 20);
  const batterieMinVolt = zahlAusEinstellung(werte, "batterie_min_v", 3.4);
  const stufe = stufeVon(zustand?.fuellstand_prozent);
  const bearbeiten = benutzer ? darfBearbeiten(benutzer.profil.rolle) : false;

  // Die Batterie kommt je nach Geraeteart in Prozent oder in Volt: ein
  // Fertiggeraet meldet den Ladestand, der Eigenbau die Zellenspannung
  // (0020_fertiggeraete.sql). Was die Kurve zeigt, entscheidet deshalb nicht
  // die Bauart, sondern was im Zeitraum tatsaechlich angekommen ist - sonst
  // stuende bei einem getauschten Sensor eine leere Kurve da.
  const hatProzent = messreihe.some((m) => m.batterie_prozent !== null);
  const hatVolt = messreihe.some((m) => m.batterie_v !== null);
  const inProzent = hatProzent || !hatVolt;
  const batteriereihe = messreihe.map((m) => ({
    zeit: m.zeit,
    wert: inProzent ? m.batterie_prozent : m.batterie_v,
  }));
  // Prozent ist von Haus aus eine 0..100er Achse. Volt nicht: eine
  // Lithiumzelle bewegt sich im Betrieb zwischen etwa 3,0 und 3,7 V, und auf
  // einer Achse ab 0 V waere ihr ganzer Verlauf ein Strich am oberen Rand.
  // Die Achse spannt deshalb um die tatsaechlichen Werte und um die Schwelle,
  // auf ganze Zehntel gerundet - die Schwelle muss zu sehen sein, auch wenn
  // die Zelle noch weit darueber liegt.
  const voltwerte = batteriereihe
    .map((b) => b.wert)
    .filter((w): w is number => w !== null)
    .concat(batterieMinVolt);
  const batterieMin = inProzent
    ? 0
    : Math.floor((Math.min(...voltwerte) - 0.1) * 10) / 10;
  const batterieMax = inProzent
    ? 100
    : Math.max(batterieMin + 0.4, Math.ceil((Math.max(...voltwerte) + 0.1) * 10) / 10);
  const batterieJetzt = inProzent ? zustand?.batterie_prozent : zustand?.batterie_v;

  return (
    <div className="space-y-6">
      {/* Kopf */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/intern/standorte?ansicht=container"
            className="text-sm text-ink-3 underline underline-offset-2"
          >
            ← Alle Container
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{c.bezeichnung ?? c.nummer}</h1>
          <p className="mt-1 text-sm text-ink-2">
            <span className="zahl">{c.nummer}</span>
            {standort?.ort && ` · ${standort.ort}`}
            {c.aufstelldatum && ` · Standort seit ${formatDatum(c.aufstelldatum)}`}
          </p>
          {standort && (
            <p className="mt-1 text-sm">
              <Link
                href={`/intern/standorte/${standort.standort_id}`}
                className="underline underline-offset-2"
              >
                {standort.name}
              </Link>
              <span className="text-ink-3">
                {standort.container_gesamt > 1
                  ? ` · einer von ${standort.container_gesamt} Containern hier, ${standort.freie_prozent ?? "–"} % frei`
                  : " · steht allein an diesem Standort"}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {standort?.lat && standort?.lng && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${standort.lat},${standort.lng}`}
              target="_blank"
              rel="noreferrer noopener"
              className="knopf-sekundaer"
            >
              Route
            </a>
          )}
          {bearbeiten && (
            <>
              <Link href={`/intern/container/${c.id}/etikett`} className="knopf-sekundaer">
                Etikett
              </Link>
              <Link href={`/intern/container/${c.id}/bearbeiten`} className="knopf-sekundaer">
                Bearbeiten
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Offene Alarme */}
      {alarme.length > 0 && (
        <div className="karte-flaeche divide-y">
          {alarme.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Stufensymbol stufe={a.typ === "fuellstand" ? "voll" : "hoch"} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.text ?? a.typ}</div>
                <div className="text-xs text-ink-3">
                  seit {formatDatumZeit(a.ausgeloest_am)}
                  {a.quittiert_am && ` · quittiert ${formatDatumZeit(a.quittiert_am)}`}
                </div>
              </div>
              {!a.quittiert_am && (
                <form action={alarmQuittieren}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="container_id" value={c.id} />
                  <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                    Quittieren
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Aktueller Stand + Verlauf */}
        <section className="karte-flaeche p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Stufensymbol stufe={stufe} groesse={20} />
              <span className="text-lg font-semibold">{STUFEN[stufe].text}</span>
            </div>
            <span className="text-sm text-ink-3">Messung {alterText(zustand?.gemessen_am)}</span>
          </div>

          <div className="mt-3">
            <Fuellstandsbalken prozent={zustand?.fuellstand_prozent ?? null} hoehe={12} />
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-ink-3">Abstand</dt>
              <dd className="zahl font-medium">{zustand?.abstand_mm ? `${zustand.abstand_mm} mm` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Batterie</dt>
              <dd className="zahl font-medium">
                {batterieJetzt !== null && batterieJetzt !== undefined
                  ? `${batterieJetzt} ${inProzent ? "%" : "V"}`
                  : "–"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Funkpegel</dt>
              <dd className="zahl font-medium">{zustand?.rssi ? `${zustand.rssi} dBm` : "–"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Einbauhöhe</dt>
              <dd className="zahl font-medium">
                {sensor?.einbauhoehe_mm ? `${sensor.einbauhoehe_mm} mm` : "–"}
              </dd>
            </div>
          </dl>

          {/* Zeitraum: eine Reihe oberhalb beider Kurven. Beide zeigen dasselbe
              Fenster, damit sich Fuellstand und Batterie untereinander lesen
              lassen. */}
          <div className="mt-6 border-t pt-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Verlauf</h2>
              <Zeitraumwahl pfad={`/intern/container/${c.id}`} aktiv={zeitraum.schluessel} />
            </div>

            <Verlaufskurve
              punkte={messreihe.map((m) => ({ zeit: m.zeit, wert: m.fuellstand_prozent }))}
              leerungen={leerungenImZeitraum}
              schwelle={{ wert: schwelleVoll, text: `voll ab ${schwelleVoll} %` }}
              ueberschrift={`Füllstand, ${zeitraumText(zeitraum)}`}
              spaltenname="Füllstand"
              von={von.toISOString()}
              bis={bis.toISOString()}
            />
            <p className="mt-2 text-xs text-ink-3">
              Grüne Punkte auf der Grundlinie markieren erkannte Leerungen.
            </p>

            <div className="mt-6">
              <Verlaufskurve
                punkte={batteriereihe}
                schwelle={
                  inProzent
                    ? { wert: batterieMinProzent, text: `schwach ab ${batterieMinProzent} %` }
                    : {
                        wert: batterieMinVolt,
                        text: `schwach ab ${batterieMinVolt.toLocaleString("de-DE")} V`,
                      }
                }
                ueberschrift={`Batterie, ${zeitraumText(zeitraum)}`}
                spaltenname="Ladezustand"
                einheit={inProzent ? "%" : "V"}
                yMin={batterieMin}
                yMax={batterieMax}
                nachkommastellen={inProzent ? 0 : 2}
                farbe="var(--serie-2)"
                wash="var(--serie-2-wash)"
                von={von.toISOString()}
                bis={bis.toISOString()}
                leerText={
                  sensor
                    ? "Dieser Sensor hat im gewählten Zeitraum keinen Batteriewert gemeldet."
                    : "Ohne zugeordneten Sensor gibt es keinen Batteriewert."
                }
              />
              <p className="mt-2 text-xs text-ink-3">
                {inProzent
                  ? "Ladezustand, wie ihn das Gerät meldet."
                  : "Zellenspannung des Eigenbaus."}{" "}
                Unterschreitet der Wert die gestrichelte Linie, löst die Anlage den Alarm
                „Batterie schwach“ aus.
              </p>
            </div>
          </div>
        </section>

        {/* Prognose, Sensor und Kalibrierung */}
        <section className="space-y-4">
          <Prognosekarte
            prognose={prognose}
            rhythmus={rhythmus}
            schwelleTour={schwelleTour}
            schwelleVoll={schwelleVoll}
          />

          <div className="karte-flaeche p-4">
            <h2 className="mb-3 font-semibold">Sensor</h2>

            {sensor ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Geräte-ID</dt>
                  <dd className="zahl font-medium">{sensor.geraete_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Status</dt>
                  <dd className="font-medium">{sensor.status}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Letzte Meldung</dt>
                  <dd>{alterText(sensor.letzte_meldung_am)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Sendeintervall</dt>
                  <dd className="zahl">{sensor.intervall_minuten} Min.</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-ink-3">Firmware</dt>
                  <dd className="zahl">{sensor.firmware ?? "–"}</dd>
                </div>
                <div className="pt-2">
                  <Link href={`/intern/sensoren`} className="text-sm underline underline-offset-2">
                    Sensorverwaltung
                  </Link>
                </div>
              </dl>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-ink-2">Diesem Container ist noch kein Sensor zugeordnet.</p>
                <Link href={`/intern/sensoren/anlernen?container=${c.id}`} className="knopf-primaer">
                  Sensor anlernen
                </Link>
              </div>
            )}
          </div>

          <div className="karte-flaeche p-4">
            <h2 className="mb-1 font-semibold">Kalibrierung</h2>
            <p className="mb-3 text-xs text-ink-3">
              Einbauhöhe = Abstand von der Sensorunterkante bis zum Boden bei leerem Container. Der
              Montageversatz des Geräts kommt automatisch dazu; der Wert, ab dem 100 % gilt, ist ein
              fester Anteil davon.
            </p>

            <form action={kalibrieren} className="space-y-3">
              <input type="hidden" name="container_id" value={c.id} />

              <div>
                <label htmlFor="einbauhoehe" className="mb-1 block text-xs text-ink-3">
                  Einbauhöhe (mm)
                </label>
                <input
                  id="einbauhoehe"
                  name="einbauhoehe_mm"
                  type="number"
                  inputMode="numeric"
                  defaultValue={sensor?.einbauhoehe_mm ?? ""}
                  placeholder="z. B. 1450"
                  className="feld zahl"
                />
                <p className="mt-1 text-xs text-ink-3">
                  Sensorunterkante bis Boden bei leerem Container. Leer lassen heißt: aus den
                  letzten Messungen ermitteln. Der Vollwert ist ein fester Anteil davon und wird
                  nicht mehr getrennt gepflegt.
                </p>
              </div>

              <button type="submit" className="knopf-primaer w-full">
                Kalibrierung speichern
              </button>
              {/* Das Fenster steht als Einstellung und war hier bis 0009 fest
                  mit einer Stunde angegeben; der Taster gilt nur für den
                  Eigenbau. Beides stand hier falsch. */}
              <p className="text-xs text-ink-3">
                Feld leer lassen und speichern: die Einbauhöhe wird aus den gültigen Messungen der
                letzten <span className="zahl">{kalibrierFenster}</span> Stunden übernommen – der
                Container muss dabei leer sein.
                {sensor && istFertiggeraet(sensor.bauart)
                  ? " Dieses Gerät meldet nur nach seinem Sendeintervall; liegt keine Messung im Fenster, die Einbauhöhe von Hand eintragen."
                  : " Beim Eigenbau lässt sich mit dem Taster am Gehäuse sofort eine Messung auslösen."}
              </p>
            </form>
          </div>
        </section>
      </div>

      {/* Erfassung vor Ort */}
      <Erfassungsbereich
        containerId={c.id}
        aktuellerFuellstand={zustand?.fuellstand_prozent ?? null}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leerungen */}
        <section className="karte-flaeche">
          <h2 className="border-b px-4 py-3 font-semibold">Leerungen</h2>
          {leerungen.length === 0 ? (
            <p className="p-6 text-sm text-ink-3">Noch keine Leerung erfasst.</p>
          ) : (
            <table className="tabelle">
              <thead>
                <tr>
                  <th>Zeitpunkt</th>
                  <th>Vorher</th>
                  <th>Art</th>
                  <th className="text-right">Menge</th>
                </tr>
              </thead>
              <tbody>
                {leerungen.map((l) => (
                  <tr key={l.id}>
                    <td className="text-ink-2">{formatDatumZeit(l.geleert_am)}</td>
                    <td className="zahl">{l.fuellstand_vorher !== null ? `${l.fuellstand_vorher} %` : "–"}</td>
                    <td className="text-ink-2">{l.art === "automatisch" ? "erkannt" : "erfasst"}</td>
                    <td className="zahl text-right">{l.menge_kg !== null ? `${l.menge_kg} kg` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Meldungen */}
        <section className="karte-flaeche">
          <h2 className="border-b px-4 py-3 font-semibold">Meldungen</h2>
          {meldungen.length === 0 ? (
            <p className="p-6 text-sm text-ink-3">Keine Meldungen vorhanden.</p>
          ) : (
            <ul className="divide-y">
              {meldungen.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {MELDUNG_TEXT[m.typ] ?? m.typ}
                      {m.erledigt_am && <span className="ml-2 text-xs font-normal text-ink-3">erledigt</span>}
                    </div>
                    {m.text && <p className="text-sm text-ink-2">{m.text}</p>}
                    <div className="text-xs text-ink-3">{formatDatumZeit(m.gemeldet_am)}</div>
                  </div>
                  {!m.erledigt_am && (
                    <form action={meldungErledigen}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="container_id" value={c.id} />
                      <button type="submit" className="knopf-sekundaer px-3 py-1.5">
                        Erledigt
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
