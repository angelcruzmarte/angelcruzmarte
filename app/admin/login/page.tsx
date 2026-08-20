import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { isAdminHost, mainSiteUrl } from "@/lib/domains"
import { AdminLoginForm } from "@/components/admin-login-form"

export const metadata: Metadata = {
  title: "Admin sign in · VOXYFI",
  // Keep the admin entrance out of search results.
  robots: { index: false, follow: false },
}

/**
 * Dedicated administrator login. This route lives OUTSIDE the guarded
 * `(dashboard)` layout on purpose, so unauthenticated admins can reach it
 * without the guard bouncing them into a redirect loop. A visitor who is
 * already a verified admin is sent straight to the dashboard.
 */
export default async function AdminLoginPage() {
  const host = (await headers()).get("host")
  const onAdminHost = isAdminHost(host)
  // On the admin subdomain the dashboard is served at the root; otherwise it
  // lives under /admin. Non-admins are pointed back at the main user app.
  const adminHome = onAdminHost ? "/" : "/admin"
  const appHref = onAdminHost ? mainSiteUrl("/app") : "/app"

  const user = await getCurrentUser()
  if (isAdmin(user)) redirect(adminHome)

  return (
    <AdminLoginForm
      adminHome={adminHome}
      appHref={appHref}
      alreadySignedIn={!!user}
    />
  )
}
