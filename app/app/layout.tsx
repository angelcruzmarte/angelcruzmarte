import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { AppTabBar } from "@/components/app-tab-bar"
import { UserMenu } from "@/components/user-menu"
import { Badge } from "@/components/ui/badge"
import { Waves } from "lucide-react"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  const subscribed = hasActiveSubscription(user)

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <Link href="/app" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Waves className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight">VOXYFI</span>
        </Link>
        <div className="flex items-center gap-2">
          {subscribed ? (
            <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
              Premium
            </Badge>
          ) : (
            <Link href="/subscribe">
              <Badge
                variant="outline"
                className="cursor-pointer border-primary/40 text-primary"
              >
                Upgrade
              </Badge>
            </Link>
          )}
          <UserMenu name={user.name} email={user.email} isAdmin={user.role === "admin"} />
        </div>
      </header>

      <main className="flex-1 pb-28">{children}</main>

      <AppTabBar />
    </div>
  )
}
