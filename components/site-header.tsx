import Link from "next/link"
import { AudioLines } from "lucide-react"
import { getCurrentUser, hasActiveSubscription, isAdmin } from "@/lib/session"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { UserMenu } from "@/components/user-menu"

export async function SiteHeader() {
  const user = await getCurrentUser()
  const subscribed = hasActiveSubscription(user)
  const admin = isAdmin(user)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <AudioLines className="h-5 w-5" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold tracking-tight">Voxify</span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <>
              <Link
                href="/library"
                className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
              >
                Library
              </Link>
              {subscribed ? (
                <Badge variant="secondary" className="hidden sm:inline-flex">
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
              <UserMenu name={user.name} email={user.email} isAdmin={admin} />
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Sign in
              </Link>
              <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
                Get started
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
