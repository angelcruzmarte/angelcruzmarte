/**
 * Domain helpers for serving the admin back office on its own subdomain
 * (admin.<root>) while the user-facing app stays on the primary domain.
 */

/** The production root domain, e.g. "voxyfi.com" (no protocol, no trailing slash). */
export function getRootDomain(): string | null {
  const raw = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (!raw) return null
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "")
}

/** True when the request host is the admin subdomain (admin.*). */
export function isAdminHost(host: string | null | undefined): boolean {
  if (!host) return false
  return host.split(":")[0].startsWith("admin.")
}

/** Absolute URL on the primary (user-facing) domain. Falls back to a path in dev/preview. */
export function mainSiteUrl(path = "/"): string {
  const root = getRootDomain()
  return root ? `https://${root}${path}` : path
}

/** Absolute URL on the admin subdomain. Falls back to the /admin path in dev/preview. */
export function adminSiteUrl(path = "/"): string {
  const root = getRootDomain()
  if (!root) return `/admin${path === "/" ? "" : path}`
  return `https://admin.${root}${path}`
}
