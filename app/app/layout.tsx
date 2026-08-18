import { redirect } from "next/navigation"
import Link from "next/link"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { AppTabBar } from "@/components/app-tab-bar"
import { PlayerProvider } from "@/components/player-provider"
import { ListeningPreferencesProvider } from "@/components/listening-preferences"
import { CartProvider } from "@/components/cart-provider"
import { CartDrawer } from "@/components/cart-drawer"
import { ReadingAssistant } from "@/components/reading-assistant"
import { UserMenu } from "@/components/user-menu"
import { WebOnly } from "@/components/web-only"
import { Badge } from "@/components/ui/badge"
import { BrandLogo } from "@/components/brand-logo"
import { PremiumBadge } from "@/components/premium-badge"
import { ArrowUp } from "lucide-react"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (!user.onboardingComplete) redirect("/onboarding")
  const subscribed = hasActiveSubscription(user)
  // Speechify-style free tier: everyone can use the app. Non-subscribers get a
  // limited experience (a daily listening cap, only the free preview voices,
  // and a small daily AI-tool quota) that nudges them to subscribe — enforced
  // per-feature rather than by locking them out at the door.

  return (
    <CartProvider>
    <ListeningPreferencesProvider
      value={{
        autoPlay: user.prefAutoPlay,
        autoHide: user.prefAutoHide,
        mixAudio: user.prefMixAudio,
        autoSkip: user.prefAutoSkip,
      }}
    >
    <PlayerProvider>
    <div className="mx-auto flex min-h-svh max-w-2xl flex-col bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md">
        <Link
          href="/app"
          className="-mx-1 rounded-xl px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="VOXYFI home"
        >
          <BrandLogo size="sm" />
        </Link>
        <div className="flex items-center gap-2.5">
          {subscribed ? (
            <PremiumBadge />
          ) : (
            <WebOnly>
              <Link href="/subscribe" aria-label="Upgrade to Premium">
                <Badge
                  variant="outline"
                  className="cursor-pointer gap-1 border-primary/40 text-primary transition-colors hover:bg-primary/10"
                >
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                  Upgrade
                </Badge>
              </Link>
            </WebOnly>
          )}
          <UserMenu
            name={user.name}
            email={user.email}
            isAdmin={user.role === "admin"}
            isSubscribed={subscribed}
            image={user.image}
          />
        </div>
      </header>

      <main className="flex-1 pb-28">{children}</main>

      <AppTabBar />
      <CartDrawer />
      <ReadingAssistant />
    </div>
    </PlayerProvider>
    </ListeningPreferencesProvider>
    </CartProvider>
  )
}
