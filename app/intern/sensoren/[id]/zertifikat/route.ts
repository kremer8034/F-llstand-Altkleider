import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { angemeldeterBenutzer, darfBearbeiten } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { zertifikatsdateien } from "@/lib/sensoreinstellungen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gibt Client-Zertifikat und -Schluessel EINES Geraets zum Herunterladen aus.
 *
 * Je Geraet ein eigener Ausweis: nur so laesst sich ein gestohlenes Geraet
 * aussperren, ohne alle anderen neu einzustellen
 * (scripts/geraet-sperren.sh).
 *
 * Bewusst ein Route Handler mit Anmeldepruefung und nicht public/: der
 * Schluessel ist ein Zugangsmittel. Wer ihn hat, kommt am Broker vorbei an
 * der Zertifikatspruefung - laege er unter public/, koennte ihn jeder
 * abrufen, der die Adresse kennt.
 *
 * Das Wurzelzertifikat (CA File) liegt dagegen sehr wohl unter public/: es
 * ist oeffentlich und steht in jedem Browser.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const benutzer = await angemeldeterBenutzer();
  if (!benutzer) {
    return NextResponse.json({ fehler: "Nicht angemeldet" }, { status: 401 });
  }
  // Dieselbe Grenze wie bei der Einstellungsseite: wer keine Geraete pflegen
  // darf, braucht auch ihren Ausweis nicht.
  if (!darfBearbeiten(benutzer.profil.rolle)) {
    return NextResponse.json({ fehler: "Keine Berechtigung" }, { status: 403 });
  }

  const { id } = await params;
  const supabase = await serverClient();
  const { data } = await supabase.from("sensor").select("geraete_id").eq("id", id).maybeSingle();
  const geraeteId = (data as { geraete_id?: string } | null)?.geraete_id;

  if (!geraeteId) {
    return NextResponse.json({ fehler: "Gerät unbekannt" }, { status: 404 });
  }

  const art = request.nextUrl.searchParams.get("art") ?? "";
  const dateien = zertifikatsdateien(geraeteId);
  const datei = dateien[art as keyof typeof dateien];

  // Feste Zuordnung statt eines Dateinamens aus der Adresszeile - sonst waere
  // dies ein Weg, beliebige Dateien des Servers zu lesen.
  if (!datei) {
    return NextResponse.json({ fehler: "Unbekannte Datei" }, { status: 404 });
  }

  const ordner = process.env.GERAETE_ZERTIFIKATE || "/geraete";

  let inhalt: string;
  try {
    inhalt = await readFile(join(ordner, datei), "utf8");
  } catch {
    return NextResponse.json(
      {
        fehler:
          `Für dieses Gerät gibt es noch keinen Ausweis. Auf dem Server: ` +
          `sh scripts/geraete-zertifikate.sh ${geraeteId}`,
      },
      { status: 503 },
    );
  }

  return new NextResponse(inhalt, {
    headers: {
      "Content-Type": "application/x-pem-file",
      "Content-Disposition": `attachment; filename="${datei}"`,
      // Nicht zwischenspeichern - weder im Browser noch unterwegs.
      "Cache-Control": "no-store",
    },
  });
}
