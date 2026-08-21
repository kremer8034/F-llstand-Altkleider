import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="de">
      <body className="min-h-dvh bg-plane text-ink antialiased">{children}</body>
    </html>
  );
}
