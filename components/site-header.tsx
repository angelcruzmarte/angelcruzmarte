import Link from "next/link"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { buttonVariants } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import { WebOnly } from "@/components/web-only"
import { BrandLogo } from "@/components/brand-logo"
import { PremiumBadge } from "@/components/premium-badge"

export async function SiteHeader() {
  const user = await getCurrentUser()
  const subscribed = hasActiveSubscription(user)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/">
          <BrandLogo size="md" />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link
                href="/app"
                className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                Open app
              </Link>
              {subscribed ? (
                <PremiumBadge className="hidden sm:inline-flex" />
              ) : (
                <WebOnly>
                  <Link
                    href="/subscribe"
                    className={buttonVariants({ size: "sm" })}
                  >
                    Subscribe
                  </Link>
                </WebOnly>
              )}
              <UserMenu
                name={user.name}
                email={user.email}
                isSubscribed={subscribed}
              />
            </>
          ) : (
            <Link href="/sign-in" className={buttonVariants({ size: "sm" })}>
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}
