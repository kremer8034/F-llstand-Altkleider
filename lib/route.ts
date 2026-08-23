/**
 * Routenplanung für die Leerungstour.
 *
 * Welche Container angefahren werden, entscheidet der Füllstand. In welcher
 * REIHENFOLGE, entscheidet allein die Fahrtstrecke - beides ist bewusst
 * getrennt. Ein Container, der zu 99 % voll ist, wird auf derselben Tour
 * geleert wie einer mit 78 %; ihn zuerst anzufahren bringt nichts, kostet aber
 * Umwege.
 *
 * Verfahren: Nächster-Nachbar als erster Wurf, danach 2-opt zum Ausbügeln der
 * Kreuzungen. Für die hier zu erwartenden Größenordnungen (bis etwa 50 Ziele)
 * liefert das in wenigen Millisekunden eine Route, die typischerweise wenige
 * Prozent über dem Optimum liegt - und das Optimum exakt zu berechnen ist ab
 * etwa 15 Zielen nicht mehr sinnvoll machbar.
 *
 * Gerechnet wird mit Luftlinie. Für echte Straßenkilometer bräuchte es einen
 * Routing-Dienst; im Landkreis mit seinem dichten Straßennetz liegt die
 * Luftlinien-Reihenfolge fast immer richtig. Die Kilometerangabe ist deshalb
 * ein Anhaltswert, keine Fahrleistung.
 */

export interface Ort {
  lat: number;
  lng: number;
}

/** Entfernung zweier Koordinaten in Kilometern (Haversine). */
export function entfernungKm(a: Ort, b: Ort): number {
  const R = 6371;
  const bogen = Math.PI / 180;
  const dLat = (b.lat - a.lat) * bogen;
  const dLng = (b.lng - a.lng) * bogen;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * bogen) * Math.cos(b.lat * bogen) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Route {
  /** Indizes der Ziele in der Reihenfolge, in der sie angefahren werden. */
  reihenfolge: number[];
  /** Entfernung zum jeweiligen Ziel, parallel zu `reihenfolge`. */
  etappen: number[];
  /** Weg vom letzten Ziel zurück zum Start; null ohne Rundfahrt. */
  rueckweg: number | null;
  /** Gesamtstrecke in Kilometern. */
  strecke: number;
}

/**
 * Plant die Reihenfolge.
 *
 * @param ziele    anzufahrende Orte
 * @param start    Ausgangspunkt (Standort oder Betriebshof); ohne Startpunkt
 *                 beginnt die Tour beim ersten Ziel
 * @param rundfahrt ob der Rückweg zum Start mitzählt
 */
export function routePlanen(ziele: Ort[], start: Ort | null, rundfahrt = false): Route {
  const n = ziele.length;
  if (n === 0) return { reihenfolge: [], etappen: [], rueckweg: null, strecke: 0 };

  // Ohne Startpunkt dient das erste Ziel als Ausgangspunkt.
  const ausgang = start ?? ziele[0];

  // Entfernungen einmal vorberechnen: Index 0 ist der Ausgangspunkt,
  // 1..n sind die Ziele.
  const orte: Ort[] = [ausgang, ...ziele];
  const d: number[][] = orte.map((a) => orte.map((b) => entfernungKm(a, b)));

  // ---- Erster Wurf: immer zum nächstgelegenen noch offenen Ziel ----------
  const offen = new Set<number>(Array.from({ length: n }, (_, i) => i + 1));
  let aktuell = 0;
  let tour: number[] = [];

  while (offen.size > 0) {
    let bestes = -1;
    let beste = Infinity;
    for (const kandidat of offen) {
      if (d[aktuell][kandidat] < beste) {
        beste = d[aktuell][kandidat];
        bestes = kandidat;
      }
    }
    tour.push(bestes);
    offen.delete(bestes);
    aktuell = bestes;
  }

  // ---- 2-opt: Teilstücke umdrehen, solange es kürzer wird ----------------
  const kosten = (folge: number[]): number => {
    let summe = d[0][folge[0]];
    for (let i = 1; i < folge.length; i++) summe += d[folge[i - 1]][folge[i]];
    if (rundfahrt) summe += d[folge[folge.length - 1]][0];
    return summe;
  };

  let laenge = kosten(tour);

  // Obergrenze, damit die Schleife auch bei krummen Daten sicher endet.
  for (let runde = 0; runde < 60; runde++) {
    let verbessert = false;

    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        const versuch = [...tour.slice(0, i), ...tour.slice(i, j + 1).reverse(), ...tour.slice(j + 1)];
        const neu = kosten(versuch);
        // Kleine Schwelle gegen Rundungsflattern
        if (neu < laenge - 1e-9) {
          tour = versuch;
          laenge = neu;
          verbessert = true;
        }
      }
    }

    if (!verbessert) break;
  }

  // ---- Ergebnis aufbereiten ---------------------------------------------
  const etappen: number[] = [];
  let vorher = 0;
  for (const knoten of tour) {
    etappen.push(d[vorher][knoten]);
    vorher = knoten;
  }

  const rueckweg = rundfahrt ? d[vorher][0] : null;

  return {
    reihenfolge: tour.map((knoten) => knoten - 1),
    etappen,
    rueckweg,
    strecke: laenge,
  };
}

/**
 * Zerlegt die Route in Abschnitte, die sich als Google-Maps-Link öffnen
 * lassen: ein Ziel plus höchstens neun Zwischenziele je Aufruf.
 */
export function kartenAbschnitte<T extends Ort>(punkte: T[], start: Ort | null): string[] {
  if (punkte.length === 0) return [];

  const koordinate = (o: Ort) => `${o.lat.toFixed(6)},${o.lng.toFixed(6)}`;
  const links: string[] = [];
  const proAbschnitt = 10; // Ziel + 9 Zwischenziele

  for (let i = 0; i < punkte.length; i += proAbschnitt) {
    const teil = punkte.slice(i, i + proAbschnitt);
    const ziel = teil[teil.length - 1];
    const zwischen = teil.slice(0, -1);

    // Der erste Abschnitt startet am Standort, jeder weitere dort, wo der
    // vorherige geendet hat.
    const ursprung = i === 0 ? start : punkte[i - 1];

    const teile = [
      "https://www.google.com/maps/dir/?api=1",
      `destination=${koordinate(ziel)}`,
      ursprung ? `origin=${koordinate(ursprung)}` : null,
      zwischen.length > 0 ? `waypoints=${zwischen.map(koordinate).join("|")}` : null,
      "travelmode=driving",
    ].filter(Boolean);

    links.push(teile.join("&"));
  }

  return links;
}

/**
 * Was kostet es, ein Ziel ZUSÄTZLICH in eine geplante Route zu hängen?
 *
 * Nicht die Entfernung zum Ziel, sondern der Umweg an der günstigsten Stelle:
 *
 *     d(vorher, Ziel) + d(Ziel, nachher) − d(vorher, nachher)
 *
 * Das ist die Zahl, mit der sich entscheiden lässt, ob ein voller Container
 * abseits der Route heute mitgenommen wird oder zwei Tage stehen bleibt
 * (siehe docs/tourenplanung.md, Abschnitt 3).
 *
 * @param folge     die geplante Reihenfolge der schon gesetzten Ziele
 * @param start     Ausgangspunkt oder null
 * @param ziel      der zusätzliche Stopp
 * @param rundfahrt ob am Ende zum Start zurückgefahren wird
 */
export function umwegKm(folge: Ort[], start: Ort | null, ziel: Ort, rundfahrt = false): number {
  // Ohne andere Ziele gibt es keinen Umweg, sondern nur die Fahrt selbst.
  if (folge.length === 0) {
    if (!start) return 0;
    return entfernungKm(start, ziel) * (rundfahrt ? 2 : 1);
  }

  // Die Kette, in die eingefügt wird: Start, Ziele, bei Rundfahrt zurück.
  const kette: (Ort | null)[] = [start, ...folge, rundfahrt ? start : null];

  let bestes = Infinity;
  for (let i = 0; i < kette.length - 1; i++) {
    const vorher = kette[i];
    const nachher = kette[i + 1];
    if (!vorher && !nachher) continue;

    // Am offenen Anfang oder Ende hängt das Ziel nur an einer Seite.
    if (!vorher) {
      bestes = Math.min(bestes, entfernungKm(ziel, nachher!));
      continue;
    }
    if (!nachher) {
      bestes = Math.min(bestes, entfernungKm(vorher, ziel));
      continue;
    }

    bestes = Math.min(
      bestes,
      entfernungKm(vorher, ziel) + entfernungKm(ziel, nachher) - entfernungKm(vorher, nachher),
    );
  }

  return Math.max(0, bestes === Infinity ? 0 : bestes);
}
