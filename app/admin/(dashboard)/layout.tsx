import type React from "react"
import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { isAdminHost, mainSiteUrl } from "@/lib/domains"
import { AdminNav } from "@/components/admin-nav"
import { BrandLogo } from "@/components/brand-logo"
import { getReviewCount } from "@/app/actions/admin"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // On the admin subdomain, non-admins must be sent to the primary domain
  // (a relative redirect would resolve back onto the admin subdomain).
  const host = (await headers()).get("host")
  const onAdminHost = isAdminHost(host)
  // Unauthenticated visitors land on the dedicated admin login. On the admin
  // subdomain the clean path is "/login" (the proxy rewrites it to
  // /admin/login); on the primary domain and in dev/preview it's "/admin/login".
  const loginUrl = onAdminHost ? "/login" : "/admin/login"
  // Authenticated but non-admin accounts are denied and returned to the normal
  // user app — never shown any part of the admin portal.
  const appUrl = onAdminHost ? mainSiteUrl("/app") : "/app"

  const user = await getCurrentUser()
  if (!user) redirect(loginUrl)
  if (!isAdmin(user)) redirect(appUrl)

  const reviewCount = await getReviewCount()

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <BrandLogo size="sm" subtitle="Admin" />
          {/* Always-visible return button (mobile shows only the icon). */}
          <Link
            href={appUrl}
            className="ml-auto flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:hidden"
            aria-label="Back to app"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to app</span>
          </Link>
        </div>

        <div className="px-3 pb-4 lg:pb-0">
          <AdminNav reviewCount={reviewCount} />
        </div>

        <div className="hidden px-3 lg:block">
          <Link
            href={appUrl}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to app
          </Link>
        </div>
      </aside>

      <main className="min-w-0">{children}</main>
    </div>
  )
}
