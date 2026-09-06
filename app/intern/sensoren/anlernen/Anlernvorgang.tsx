"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { QrScanner } from "@/components/QrScanner";
import { istFertiggeraet } from "@/lib/geraetearten";
import { kalibrierungSetzen, sensorKoppeln, type KopplungErgebnis } from "../aktionen";

export interface Anlerncontainer {
  id: string;
  nummer: string;
  bezeichnung: string | null;
  /** Anschrift und Koordinaten trägt seit 0022 der Platz, nicht der Container. */
  standort_name: string | null;
  /** Koordinaten des Platzes - zum Sortieren nach Entfernung. */
  lat: number | null;
  lng: number | null;
  hatSensor: boolean;
  kalibriert: boolean;
}

type Schritt = "code" | "container" | "bestaetigen" | "kalibrieren" | "fertig";

/** Aus einem gescannten Wert den Anlerncode holen - Link oder blanker Code. */
function codeAusScan(wert: string): string | null {
  const roh = wert.trim();
  try {
    const url = new URL(roh);
    const ausParameter = url.searchParams.get("code");
    if (ausParameter) return ausParameter.toUpperCase();
  } catch {
    // kein Link - dann ist es hoffentlich direkt der Code
  }
  const treffer = roh.toUpperCase().match(/[A-Z0-9]{4}-?[A-Z0-9]{4}/);
  return treffer ? treffer[0] : null;
}

function entfernungKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function Anlernvorgang({
  container,
  codeAusLink,
  containerAusLink,
}: {
  container: Anlerncontainer[];
  codeAusLink: string | null;
  containerAusLink: string | null;
}) {
  const [schritt, setSchritt] = useState<Schritt>(codeAusLink ? "container" : "code");
  const [code, setCode] = useState(codeAusLink ?? "");
  const [scannen, setScannen] = useState(false);
  const [gewaehlt, setGewaehlt] = useState<string | null>(containerAusLink);
  const [suche, setSuche] = useState("");
  const [standort, setStandort] = useState<[number, number] | null>(null);
  const [ersetzen, setErsetzen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [ergebnis, setErgebnis] = useState<KopplungErgebnis | null>(null);
  const [einbauhoehe, setEinbauhoehe] = useState("");
  const [kalibrierung, setKalibrierung] = useState<{
    ok: boolean;
    fehler?: string;
    hoehe?: number;
    leer?: number;
  } | null>(null);

  const container_ = useMemo(() => new Map(container.map((c) => [c.id, c])), [container]);
  const ausgewaehlt = gewaehlt ? container_.get(gewaehlt) ?? null : null;

  const gefiltert = useMemo(() => {
    const text = suche.trim().toLowerCase();
    let liste = container;

    if (text) {
      liste = liste.filter((c) =>
        [c.nummer, c.bezeichnung, c.standort_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(text),
      );
    }

    if (standort) {
      liste = [...liste].sort((a, b) => {
        if (a.lat === null || a.lng === null) return 1;
        if (b.lat === null || b.lng === null) return -1;
        return entfernungKm(standort, [a.lat, a.lng]) - entfernungKm(standort, [b.lat, b.lng]);
      });
    }

    return liste.slice(0, 40);
  }, [container, suche, standort]);

  const treffer = useCallback((wert: string) => {
    const erkannt = codeAusScan(wert);
    if (erkannt) {
      setCode(erkannt);
      setScannen(false);
      setSchritt("container");
    }
  }, []);

  function standortHolen() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setStandort([p.coords.latitude, p.coords.longitude]),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function koppeln() {
    if (!gewaehlt) return;
    setLaeuft(true);

    const formular = new FormData();
    formular.set("anlerncode", code);
    formular.set("container_id", gewaehlt);
    if (ersetzen) formular.set("ersetzen", "on");
    if (standort) {
      formular.set("gps_lat", String(standort[0]));
      formular.set("gps_lng", String(standort[1]));
    }

    const antwort = await sensorKoppeln(null, formular);
    setErgebnis(antwort);
    setLaeuft(false);
    if (antwort.ok) setSchritt("kalibrieren");
  }

  async function kalibrieren() {
    if (!gewaehlt) return;
    setLaeuft(true);

    const formular = new FormData();
    formular.set("container_id", gewaehlt);
    if (einbauhoehe.trim()) formular.set("einbauhoehe_mm", einbauhoehe.trim());

    const antwort = await kalibrierungSetzen(null, formular);
    setKalibrierung(antwort);
    setLaeuft(false);
    if (antwort.ok) setSchritt("fertig");
  }

  return (
    <div className="space-y-4">
      <Schrittanzeige aktuell={schritt} />

      {/* ---- Schritt 1: Anlerncode ---- */}
      {schritt === "code" && (
        <div className="karte-flaeche space-y-4 p-5">
          <div>
            <h2 className="font-semibold">1. Gerät erfassen</h2>
            <p className="mt-1 text-sm text-ink-2">
              QR-Code auf dem Gehäuse scannen oder den achtstelligen Anlerncode eingeben.
            </p>
          </div>

          {scannen ? (
            <QrScanner beiTreffer={treffer} beiAbbruch={() => setScannen(false)} />
          ) : (
            <>
              <button type="button" onClick={() => setScannen(true)} className="knopf-primaer w-full">
                QR-Code scannen
              </button>

              <div className="flex items-center gap-3 text-xs text-ink-3">
                <span className="h-px flex-1" style={{ background: "var(--linie)" }} />
                oder
                <span className="h-px flex-1" style={{ background: "var(--linie)" }} />
              </div>

              <div>
                <label htmlFor="code" className="mb-1 block text-sm font-medium">
                  Anlerncode
                </label>
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  className="feld zahl text-lg tracking-widest"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </div>

              <button
                type="button"
                disabled={code.replace(/[^A-Z0-9]/g, "").length < 8}
                onClick={() => setSchritt("container")}
                className="knopf-primaer w-full"
              >
                Weiter
              </button>
            </>
          )}
        </div>
      )}

      {/* ---- Schritt 2: Container waehlen ---- */}
      {schritt === "container" && (
        <div className="karte-flaeche space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">2. Container wählen</h2>
              <p className="mt-1 text-sm text-ink-2">
                Gerät <span className="zahl font-medium">{code}</span>
              </p>
            </div>
            <button type="button" onClick={() => setSchritt("code")} className="text-sm underline underline-offset-2">
              ändern
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="search"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Nummer, Standort oder Ort"
              className="feld flex-1"
              aria-label="Container suchen"
            />
            <button type="button" onClick={standortHolen} className="knopf-sekundaer shrink-0">
              {standort ? "Standort aktuell" : "In der Nähe"}
            </button>
          </div>

          <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
            {gefiltert.map((c) => {
              const entfernung =
                standort && c.lat !== null && c.lng !== null ? entfernungKm(standort, [c.lat, c.lng]) : null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setGewaehlt(c.id);
                      setErsetzen(false);
                      setSchritt("bestaetigen");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-flaeche-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.bezeichnung ?? c.nummer}</span>
                        <span className="zahl text-xs text-ink-3">{c.nummer}</span>
                        {c.hatSensor && (
                          <span className="rounded bg-flaeche-2 px-1.5 py-0.5 text-xs text-ink-2">
                            hat schon einen Sensor
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-ink-2">
                        {c.standort_name ?? ""}
                      </div>
                    </div>
                    {entfernung !== null && (
                      <span className="zahl shrink-0 text-xs text-ink-3">
                        {entfernung.toFixed(1).replace(".", ",")} km
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
            {gefiltert.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-ink-3">Kein Container gefunden.</li>
            )}
          </ul>
        </div>
      )}

      {/* ---- Schritt 3: Bestaetigen ---- */}
      {schritt === "bestaetigen" && ausgewaehlt && (
        <div className="karte-flaeche space-y-4 p-5">
          <h2 className="font-semibold">3. Verheiratung bestätigen</h2>

          <dl className="space-y-2 rounded-lg border p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Gerät</dt>
              <dd className="zahl font-medium">{code}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-3">Container</dt>
              <dd className="text-right font-medium">
                {ausgewaehlt.bezeichnung ?? ausgewaehlt.nummer}
                <div className="text-xs font-normal text-ink-2">
                  {ausgewaehlt.standort_name ?? ""}
                </div>
              </dd>
            </div>
          </dl>

          {ausgewaehlt.hatSensor && (
            <label className="flex items-start gap-2 rounded-lg border p-3 text-sm">
              <input
                type="checkbox"
                checked={ersetzen}
                onChange={(e) => setErsetzen(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                An diesem Container hängt bereits ein Sensor. Ich möchte ihn <strong>ersetzen</strong> –
                das alte Gerät wird außer Betrieb genommen, die Historie bleibt erhalten.
              </span>
            </label>
          )}

          {ergebnis?.fehler && (
            <p role="alert" className="text-sm" style={{ color: "var(--kritisch)" }}>
              {ergebnis.fehler}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={koppeln}
              disabled={laeuft || (ausgewaehlt.hatSensor && !ersetzen)}
              className="knopf-primaer flex-1"
            >
              {laeuft ? "Wird gekoppelt …" : "Jetzt koppeln"}
            </button>
            <button type="button" onClick={() => setSchritt("container")} className="knopf-sekundaer">
              Zurück
            </button>
          </div>
        </div>
      )}

      {/* ---- Schritt 4: Kalibrieren ---- */}
      {schritt === "kalibrieren" && (
        <div className="karte-flaeche space-y-4 p-5">
          <div>
            <h2 className="font-semibold">4. Kalibrieren</h2>
            <p className="mt-1 text-sm text-ink-2">
              Jetzt lernt das System, welcher Abstand „leer“ bedeutet.
            </p>
          </div>

          {/* Die Handgriffe unterscheiden sich je Bauart. Der Eigenbau hat
              einen Taster außen; ein EM400 hat außen nichts - sein Taster
              sitzt im Gehäuse und kann nur neu starten und zurücksetzen. */}
          {istFertiggeraet(ergebnis?.bauart) ? (
            <ol className="space-y-2 rounded-lg border p-3 text-sm text-ink-2">
              <li>1. Container muss leer sein und der Deckel geschlossen.</li>
              <li>
                2. Dieses Gerät hat außen <strong>keinen Taster</strong>. Es meldet von selbst nach
                seinem Sendeintervall – bei 360 Minuten kann das dauern. Zwei Wege, das abzukürzen:
              </li>
              <li className="ml-4">
                <strong>a)</strong> In der ToolBox-App unter <em>Device → General</em> das
                Reporting Interval auf <span className="zahl">1</span> stellen, <em>Write</em>,
                die Meldung abwarten, danach wieder auf <span className="zahl">360</span> stellen
                und erneut <em>Write</em>.
              </li>
              <li className="ml-4">
                <strong>b)</strong> Ohne Warten: In der ToolBox unter <em>Calibration</em> steht
                „Current Value“. Diesen Wert in <strong>Millimetern</strong> unten eintragen –
                1,45 m sind 1450.
              </li>
              <li>3. Dann auf „Aus den Messungen übernehmen“ tippen.</li>
            </ol>
          ) : (
            <ol className="space-y-2 rounded-lg border p-3 text-sm text-ink-2">
              <li>1. Container muss leer sein und der Deckel geschlossen.</li>
              <li>
                2. Taster am Sensorgehäuse einmal drücken – das Gerät sendet sofort eine Messung
                (Quittung: die LED blinkt zweimal grün).
              </li>
              <li>3. Kurz warten und dann unten auf „Aus den Messungen übernehmen“ tippen.</li>
            </ol>
          )}

          <div>
            <label htmlFor="einbauhoehe" className="mb-1 block text-sm font-medium">
              Einbauhöhe von Hand setzen (mm, optional)
            </label>
            <input
              id="einbauhoehe"
              value={einbauhoehe}
              onChange={(e) => setEinbauhoehe(e.target.value)}
              type="number"
              inputMode="numeric"
              placeholder="Sensorunterkante bis Boden, z. B. 1450"
              className="feld zahl"
            />
            <p className="mt-1 text-xs text-ink-3">
              Sensorunterkante bis Boden bei leerem Container. Leer lassen, um den Median der
              letzten Messungen zu übernehmen – der rohe Abstand ist genau diese Höhe.
              {istFertiggeraet(ergebnis?.bauart) &&
                " Solange keine Messung angekommen ist, führt nur dieser Weg weiter."}
            </p>
          </div>

          {kalibrierung?.fehler && (
            <p role="alert" className="text-sm" style={{ color: "var(--kritisch)" }}>
              {kalibrierung.fehler}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={kalibrieren} disabled={laeuft} className="knopf-primaer flex-1">
              {laeuft
                ? "Wird übernommen …"
                : einbauhoehe
                  ? "Einbauhöhe speichern"
                  : "Aus den Messungen übernehmen"}
            </button>
            <button type="button" onClick={() => setSchritt("fertig")} className="knopf-sekundaer">
              Später
            </button>
          </div>
        </div>
      )}

      {/* ---- Schritt 5: Fertig ---- */}
      {schritt === "fertig" && (
        <div className="karte-flaeche space-y-4 p-5">
          <h2 className="font-semibold">Fertig</h2>
          <p className="text-sm text-ink-2">
            Sensor <span className="zahl font-medium">{ergebnis?.geraete_id ?? code}</span> ist mit
            Container <span className="font-medium">{ergebnis?.container_nummer}</span> verheiratet.
            {kalibrierung?.ok && (
              <>
                {" "}
                Einbauhöhe <span className="zahl">{kalibrierung.hoehe} mm</span> – leer gemessen ab{" "}
                <span className="zahl">{kalibrierung.leer} mm</span> Deckelinnenseite.
              </>
            )}
          </p>

          {!kalibrierung?.ok && (
            <p className="rounded-lg border p-3 text-sm text-ink-2">
              Die Kalibrierung steht noch aus. Ohne Einbauhöhe kann kein Füllstand in Prozent berechnet
              werden – Sie können das jederzeit auf der Containerseite nachholen.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {ergebnis?.container_id && (
              <Link href={`/intern/container/${ergebnis.container_id}`} className="knopf-primaer">
                Zum Container
              </Link>
            )}
            <Link href="/intern/sensoren/anlernen" className="knopf-sekundaer">
              Nächsten Sensor anlernen
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Schrittanzeige({ aktuell }: { aktuell: Schritt }) {
  const schritte: [Schritt, string][] = [
    ["code", "Gerät"],
    ["container", "Container"],
    ["bestaetigen", "Koppeln"],
    ["kalibrieren", "Kalibrieren"],
  ];
  const index = schritte.findIndex(([s]) => s === aktuell);
  const position = aktuell === "fertig" ? schritte.length : index;

  return (
    <ol className="flex items-center gap-2 text-xs">
      {schritte.map(([s, text], i) => {
        const erledigt = i < position;
        const jetzt = i === position;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                background: erledigt ? "var(--gut)" : jetzt ? "var(--serie)" : "var(--flaeche-2)",
                color: erledigt || jetzt ? "#fff" : "var(--ink-3)",
              }}
            >
              {erledigt ? "✓" : i + 1}
            </span>
            <span className={jetzt ? "font-medium text-ink" : "text-ink-3"}>{text}</span>
            {i < schritte.length - 1 && <span className="h-px flex-1" style={{ background: "var(--linie)" }} />}
          </li>
        );
      })}
    </ol>
  );
}
