import Link from "next/link"
import { redirect } from "next/navigation"
import {
  getCurrentUser,
  hasActiveSubscription,
  isTrialActive,
} from "@/lib/session"
import { syncSubscription } from "@/app/actions/subscription"
import { getPlan, formatPrice } from "@/lib/plans"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ManageBillingButton } from "@/components/manage-billing-button"
import { CancelSubscriptionButton } from "@/components/cancel-subscription-button"

export default async function AccountPage() {
  // Reconcile with Stripe on load so status is correct even without webhooks.
  // Never let a billing/Stripe hiccup crash the page (e.g. a stale customer id
  // after switching from test to live keys).
  try {
    await syncSubscription()
  } catch (error) {
    console.error("[v0] syncSubscription failed on account page:", error)
  }

  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const subscribed = hasActiveSubscription(user)
  const plan = user.plan ? getPlan(user.plan) : undefined
  const trialing = isTrialActive(user)
  const periodEndIso = user.currentPeriodEnd
    ? new Date(user.currentPeriodEnd).toISOString()
    : null

  const status = user.subscriptionStatus
  // A subscription is still "manageable" (can be cancelled / card updated) in
  // any state except fully ended — this includes a past_due/unpaid plan whose
  // card is failing. Those users MUST be able to reach the cancel and billing
  // controls to stop repeated charge attempts, even though access is locked.
  const manageable = Boolean(
    status && status !== "canceled" && status !== "incomplete_expired",
  )
  // Payment is actively failing and Stripe is retrying the card.
  const paymentFailing =
    status === "past_due" || status === "unpaid" || status === "incomplete"

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
            <Badge
              variant={
                paymentFailing
                  ? "destructive"
                  : subscribed
                    ? "default"
                    : "secondary"
              }
            >
              {user.subscriptionStatus
                ? user.subscriptionStatus
                : "no subscription"}
            </Badge>
          </div>

          {manageable ? (
            <div className="mt-4">
              <p className="text-lg font-semibold">
                {plan?.name ?? "VOXYFI Premium"}
              </p>
              {plan && (
                <p className="text-sm text-muted-foreground">
                  {formatPrice(plan.priceInCents)} / {plan.interval}
                </p>
              )}
              {paymentFailing && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-sm font-medium text-destructive">
                    Your last payment failed.
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Update your card in the billing portal to keep your plan, or
                    cancel below to stop further charge attempts.
                  </p>
                </div>
              )}
              {user.currentPeriodEnd &&
                !user.cancelAtPeriodEnd &&
                !paymentFailing && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {trialing ? "Free trial — first charge on " : "Renews on "}
                  {new Date(user.currentPeriodEnd).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
              <div className="mt-5">
                <CancelSubscriptionButton
                  cancelAtPeriodEnd={user.cancelAtPeriodEnd}
                  periodEnd={periodEndIso}
                  isTrialing={trialing}
                  paymentFailing={paymentFailing}
                />
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Update your card or view invoices in the billing portal.
                </p>
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
