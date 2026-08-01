import Link from "next/link"
import { Sparkles } from "lucide-react"
import { getCurrentUser, hasActiveSubscription, isAdmin } from "@/lib/session"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"
import { BrandLogo } from "@/components/brand-logo"

export async function SiteHeader() {
  const user = await getCurrentUser()
  const subscribed = hasActiveSubscription(user)
  const admin = isAdmin(user)

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
                <Badge className="hidden gap-1 bg-primary text-primary-foreground hover:bg-primary sm:inline-flex">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Premium
                </Badge>
              ) : (
                <Link
                  href="/subscribe"
                  className={buttonVariants({ size: "sm" })}
                >
                  Subscribe
                </Link>
              )}
              <UserMenu
                name={user.name}
                email={user.email}
                isAdmin={admin}
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
