import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

/**
 * Bis hierher stand ueberall `system-ui`. Das heisst: auf dem Windows-Rechner
 * der Disposition Segoe UI, auf dem Diensthandy Roboto, auf dem iPad San
 * Francisco - drei verschiedene Schriften mit drei verschiedenen Laufweiten.
 * Bei einer Anwendung, die im Kern aus Zahlenspalten besteht (mm, %, dBm,
 * Datumsangaben in Tabellen), sitzen Spaltenbreiten und Umbrueche damit auf
 * jedem Geraet anders. `tabular-nums` rettet die Ziffern, nicht das Layout.
 *
 * IBM Plex Sans ist gesetzt und nicht geerbt: echte Tabellenziffern, voller
 * deutscher Zeichensatz, und Buchstabenformen mit genug Eigenart, dass die
 * Oberflaeche nicht wie jede andere aussieht. next/font laedt sie beim Bauen
 * herunter und liefert sie vom eigenen Server - kein Aufruf zu Google zur
 * Laufzeit, und die Fahreransicht bleibt im Funkloch vollstaendig.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--schrift-sans",
});

/**
 * Nur fuer Maschinenkennungen: Geraete-ID, Anlerncode, Containernummer. Das
 * sind Zeichenfolgen, die jemand am Telefon vorliest oder abtippt - dort
 * traegt die feste Laufweite Bedeutung (0 und O, 1 und l bleiben
 * unterscheidbar). Nicht fuer Beschriftungen: eine Schreibmaschinenschrift
 * als Zierde an Labels ist genau die Geste, die ueberall gleich aussieht.
 */
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--schrift-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Altkleidercontainer – Füllstand",
    template: "%s · Altkleidercontainer",
  },
  description:
    "Aktuelle Füllstände der Altkleidercontainer des BRK Kreisverbands Miltenberg – live aus den Sensoren.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-plane text-ink antialiased">{children}</body>
    </html>
  );
}
