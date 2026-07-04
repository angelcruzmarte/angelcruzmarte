import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { AppTabBar } from "@/components/app-tab-bar"
import { PlayerProvider } from "@/components/player-provider"
import { MiniPlayer } from "@/components/mini-player"
import { UserMenu } from "@/components/user-menu"
import { Badge } from "@/components/ui/badge"
import { Waves, Sparkles, ArrowUp } from "lucide-react"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (!user.onboardingComplete) redirect("/onboarding")
  const subscribed = hasActiveSubscription(user)

  return (
    <PlayerProvider>
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
            <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Premium
            </Badge>
          ) : (
            <Link href="/subscribe">
              <Badge
                variant="outline"
                className="cursor-pointer gap-1 border-primary/40 text-primary"
              >
                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                Upgrade
              </Badge>
            </Link>
          )}
          <UserMenu
            name={user.name}
            email={user.email}
            isAdmin={user.role === "admin"}
            isSubscribed={subscribed}
          />
        </div>
      </header>

      <main className="flex-1 pb-28">{children}</main>

      <MiniPlayer />
      <AppTabBar />
    </div>
    </PlayerProvider>
  )
}
