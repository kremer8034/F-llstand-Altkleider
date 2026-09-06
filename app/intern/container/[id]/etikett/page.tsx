import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { rolleErzwingen } from "@/lib/auth";
import { serverClient } from "@/lib/supabase/server";
import { adresse } from "@/lib/fuellstand";
import type { Container, Standort } from "@/lib/typen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Containeretikett" };

/**
 * Der Aufkleber für die Außenseite des Containers – für Bürger, nicht für uns.
 *
 * Der QR-Code führt auf die öffentliche Seite unter /container/<Nummer>. Dort
 * steht, wie voll die Abgabestelle ist, wo die nächste mit Platz liegt, und es
 * gibt den Knopf „Container ist voll".
 *
 * Bewusst die Containernummer in der Adresse und nicht die interne Kennung:
 * der Aufkleber bleibt damit lesbar, und wer die Nummer abtippt, landet auch
 * dort.
 */
export default async function Containeretikett({ params }: { params: Promise<{ id: string }> }) {
  await rolleErzwingen(["admin", "dispo"]);
  const { id } = await params;

  const supabase = await serverClient();
  // Die Anschrift steht seit 0022 am Platz, nicht am Container - deshalb kommt
  // sie hier mit dazu.
  const { data } = await supabase
    .from("container")
    .select("*, standort:standort_id (name, strasse, plz, ort)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const c = data as Container & {
    standort: Pick<Standort, "name" | "strasse" | "plz" | "ort"> | null;
  };

  const basis = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const ziel = `${basis}/container/${encodeURIComponent(c.nummer)}`;
  const qr = await QRCode.toDataURL(ziel, { margin: 1, width: 360, errorCorrectionLevel: "M" });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="print:hidden">
        <Link
          href={`/intern/container/${c.id}`}
          className="text-sm text-ink-3 underline underline-offset-2"
        >
          ← Zurück zum Container
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Containeretikett</h1>
        <p className="mt-1 text-sm text-ink-2">
          Ausdrucken, wetterfest laminieren und außen gut sichtbar aufkleben. Wer den Code scannt,
          sieht den Füllstand, findet den nächsten Container mit Platz und kann melden, dass dieser
          hier voll ist.
        </p>
        {!basis && (
          <p className="mt-2 text-sm" style={{ color: "var(--kritisch)" }}>
            <strong>NEXT_PUBLIC_SITE_URL ist nicht gesetzt.</strong> Der QR-Code zeigt dann auf eine
            unvollständige Adresse und funktioniert nicht. Bitte zuerst eintragen.
          </p>
        )}
      </div>

      <div className="karte-flaeche mx-auto w-full max-w-sm p-6 text-center">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-3">
          BRK Kreisverband Miltenberg
        </div>
        <div className="mt-1 text-lg font-semibold">Altkleider &amp; Schuhe</div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR-Code zu ${ziel}`} className="mx-auto mt-4 h-56 w-56" />

        <div className="mt-3 text-base font-semibold">Voll? Hier scannen.</div>
        <p className="mt-1 text-sm text-ink-2">
          Zeigt den nächsten Container mit Platz – und meldet uns, wenn dieser voll ist.
        </p>

        <div className="mt-4 border-t pt-3">
          <div className="zahl text-sm font-medium">{c.nummer}</div>
          <div className="text-xs text-ink-3">{adresse(c.standort ?? {}) || c.standort?.name || ""}</div>
        </div>
      </div>

      <div className="print:hidden">
        <p className="text-center text-xs text-ink-3">Ziel des Codes: {ziel}</p>
      </div>
    </div>
  );
}
