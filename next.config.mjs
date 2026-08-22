/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Erzeugt einen eigenstaendigen Server unter .next/standalone - Grundlage
  // fuer das schlanke Docker-Image.
  output: "standalone",
};

export default nextConfig;
