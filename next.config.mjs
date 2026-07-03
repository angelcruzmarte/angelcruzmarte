/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the document parsers (and their native/worker deps) out of the
  // bundler so they run correctly in Node server routes.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
