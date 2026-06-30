import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AudioLines, ArrowLeft } from "lucide-react"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { AdminNav } from "@/components/admin-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (!isAdmin(user)) redirect("/library")

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-border bg-sidebar lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <AudioLines className="h-4 w-4" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold">Voxify</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
        </div>

        <div className="px-3 pb-4 lg:pb-0">
          <AdminNav />
        </div>

        <div className="hidden px-3 lg:block">
          <Link
            href="/library"
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
