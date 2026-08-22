/** @type {import('next').NextConfig} */

/**
 * "standalone" erzeugt unter .next/standalone einen eigenstaendigen Server -
 * die Grundlage fuer das schlanke Docker-Image (siehe Dockerfile).
 *
 * Bei Vercel wird das nicht gebraucht: dort entstehen ohnehin eigene Bundles.
 * Seit Next 16 mit Turbopack ist die Kombination sogar schaedlich - der Bau
 * bricht am Ende ab, weil Vercel eine Datei erwartet, die dieser Weg nicht
 * hinterlegt:
 *
 *   Error: ENOENT: no such file or directory,
 *   open '/vercel/path0/.next/next-server.js.nft.json'
 *
 * Deshalb: nur ausserhalb von Vercel. VERCEL=1 setzt die Bauumgebung selbst.
 */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
};

export default nextConfig;
