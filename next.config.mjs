/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the document parsers (and their native/worker deps) out of the
  // bundler so they run correctly in Node server routes. @napi-rs/canvas ships
  // a native .node binding and pdfjs-dist's legacy build isn't bundler-friendly,
  // so both must stay external and be loaded at runtime by the Node server.
  serverExternalPackages: [
    "unpdf",
    "mammoth",
    "@napi-rs/canvas",
    "pdfjs-dist",
    "sharp",
  ],
  typescript: {
    // Fail the build on type errors. The codebase type-checks clean today, so
    // this locks in that guarantee for launch.
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Baseline defense-in-depth response headers applied to every route. The v0
  // chat preview strips framing/CSP headers so the app still renders in the
  // editor; on the deployed site they all apply. CSP is REPORT-ONLY for now so
  // a too-tight rule cannot break the live site — tighten and switch to the
  // enforcing header after observing reports.
  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js emits inline hydration/runtime scripts; Stripe.js is loaded for
      // checkout. Report-only, so this only logs until enforced.
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Outbound calls the app makes: our own APIs, Blob, Open Library covers,
      // Stripe, and Vercel analytics.
      "connect-src 'self' https: blob:",
      // Stripe Checkout / embedded frames.
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com",
      "frame-ancestors 'self'",
    ].join("; ")

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
