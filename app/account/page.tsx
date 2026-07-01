import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { syncSubscription } from "@/app/actions/subscription"
import { getPlan, formatPrice } from "@/lib/plans"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ManageBillingButton } from "@/components/manage-billing-button"

export default async function AccountPage() {
  // Reconcile with Stripe on load so status is correct even without webhooks.
  await syncSubscription()

  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const subscribed = hasActiveSubscription(user)
  const plan = user.plan ? getPlan(user.plan) : undefined

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your profile and subscription.
        </p>

        <Card className="mt-8 p-6">
          <h2 className="text-sm font-medium text-muted-foreground">Profile</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
          </dl>
        </Card>

        <Card className="mt-5 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Subscription
            </h2>
            <Badge variant={subscribed ? "default" : "secondary"}>
              {user.subscriptionStatus
                ? user.subscriptionStatus
                : "no subscription"}
            </Badge>
          </div>

          {subscribed ? (
            <div className="mt-4">
              <p className="text-lg font-semibold">
                {plan?.name ?? "VOXYFI Premium"}
              </p>
              {plan && (
                <p className="text-sm text-muted-foreground">
                  {formatPrice(plan.priceInCents)} / {plan.interval}
                </p>
              )}
              {user.currentPeriodEnd && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Renews on{" "}
                  {new Date(user.currentPeriodEnd).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              <div className="mt-5">
                <ManageBillingButton />
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">
                You don&apos;t have an active subscription. Subscribe to unlock
                the full library.
              </p>
              <Link
                href="/subscribe"
                className={buttonVariants() + " mt-4"}
              >
                View plans
              </Link>
            </div>
          )}
        </Card>
      </main>
    </div>
  )
}
