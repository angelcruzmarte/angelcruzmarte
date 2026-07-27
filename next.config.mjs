/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the document parsers (and their native/worker deps) out of the
  // bundler so they run correctly in Node server routes. @napi-rs/canvas ships
  // a native .node binding and pdfjs-dist's legacy build isn't bundler-friendly,
  // so both must stay external and be loaded at runtime by the Node server.
  serverExternalPackages: ["unpdf", "mammoth", "@napi-rs/canvas", "pdfjs-dist"],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
