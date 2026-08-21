"use client";

import { useEffect, useRef, useState } from "react";

/**
 * QR-Scanner ueber die eingebaute BarcodeDetector-Schnittstelle des Browsers -
 * ohne zusaetzliche Bibliothek. Auf Android/Chrome vorhanden; wo nicht, bleibt
 * die Eingabe von Hand, deshalb ist der Scanner immer nur eine Abkuerzung.
 */
declare global {
  interface Window {
    BarcodeDetector?: new (optionen?: { formats?: string[] }) => {
      detect: (quelle: CanvasImageSource) => Promise<{ rawValue: string }[]>;
    };
  }
}

export function QrScanner({
  beiTreffer,
  beiAbbruch,
}: {
  beiTreffer: (wert: string) => void;
  beiAbbruch: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let strom: MediaStream | null = null;
    let laeuft = true;
    let zeitgeber: number | undefined;

    async function starten() {
      if (!window.BarcodeDetector) {
        setFehler("Dieser Browser kann keine QR-Codes lesen. Bitte den Code von Hand eingeben.");
        return;
      }

      try {
        strom = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
      } catch {
        setFehler("Kein Zugriff auf die Kamera. Bitte die Berechtigung erteilen oder den Code eingeben.");
        return;
      }

      if (!laeuft || !video.current) return;
      video.current.srcObject = strom;
      await video.current.play().catch(() => undefined);

      const detektor = new window.BarcodeDetector({ formats: ["qr_code"] });

      const pruefen = async () => {
        if (!laeuft || !video.current || video.current.readyState < 2) {
          zeitgeber = window.setTimeout(pruefen, 250);
          return;
        }
        try {
          const treffer = await detektor.detect(video.current);
          if (treffer.length > 0) {
            beiTreffer(treffer[0].rawValue);
            return;
          }
        } catch {
          // einzelne Fehlversuche sind normal
        }
        zeitgeber = window.setTimeout(pruefen, 250);
      };

      pruefen();
    }

    starten();

    return () => {
      laeuft = false;
      if (zeitgeber) window.clearTimeout(zeitgeber);
      strom?.getTracks().forEach((spur) => spur.stop());
    };
  }, [beiTreffer]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-lg border bg-black">
        <video ref={video} playsInline muted className="h-64 w-full object-cover" />
        <div
          className="pointer-events-none absolute inset-0 m-auto h-40 w-40 rounded-lg border-2"
          style={{ borderColor: "rgba(255,255,255,0.85)" }}
          aria-hidden
        />
      </div>

      {fehler && <p className="text-sm text-ink-2">{fehler}</p>}

      <button type="button" onClick={beiAbbruch} className="knopf-sekundaer w-full">
        Scannen beenden
      </button>
    </div>
  );
}
