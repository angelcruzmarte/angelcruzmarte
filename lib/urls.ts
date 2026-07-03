/**
 * Resolves the app's public base URL across local, preview, and production.
 * Shared by all server actions that build Stripe redirect URLs.
 */
export function getBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ??
    "http://localhost:3000"
  )
}
