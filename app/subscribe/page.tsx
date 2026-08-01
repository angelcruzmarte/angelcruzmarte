import Link from "next/link"
import { redirect } from "next/navigation"
import {
  getCurrentUser,
  hasActiveSubscription,
  isTrialExpired,
} from "@/lib/session"
import { getActivePromotion } from "@/app/actions/promotions"
import { SiteHeader } from "@/components/site-header"
import { SubscribePlans } from "@/components/subscribe-plans"
import { PricingViewTracker } from "@/components/pricing-view-tracker"

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (hasActiveSubscription(user)) redirect("/app")

  const trialEligible = !user.hasUsedTrial && !user.stripeSubscriptionId
  const trialEnded = isTrialExpired(user)

  const { canceled } = await searchParams
  const promo = await getActivePromotion()

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <PricingViewTracker path="subscribe" />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        {trialEnded && (
          <div className="mx-auto mb-8 max-w-lg rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Your free trial has ended
            </p>
            <p className="mt-1 text-balance text-lg font-semibold">
              Subscribe to keep your premium voices, AI podcasts, and full
              library.
            </p>
          </div>
        )}

        <div className="text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight">
            {trialEnded ? "Continue with Premium" : "Unlock the full library"}
          </h1>
          <p className="mt-3 text-pretty text-lg text-muted-foreground">
            Subscribe to listen to every title with natural narration and
            word-by-word highlighting.
          </p>
          {trialEligible && (
            <p className="mx-auto mt-5 inline-flex items-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Start with a 7-day free trial &mdash; cancel anytime
            </p>
          )}
        </div>

        {promo && promo.showBanner && (
          <div className="mx-auto mt-8 max-w-lg overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Limited-time offer
            </p>
            <p className="mt-1 text-balance text-xl font-semibold">
              {promo.name} &mdash; {promo.percentOff}% off
            </p>
            {promo.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {promo.description}
              </p>
            )}
            <p className="mt-2 text-sm font-medium text-primary">
              Discount applied automatically at checkout
            </p>
          </div>
        )}

        {canceled && (
          <p className="mx-auto mt-6 max-w-md rounded-lg bg-secondary px-4 py-2.5 text-center text-sm text-secondary-foreground">
            Checkout canceled. You can subscribe whenever you&apos;re ready.
          </p>
        )}

        <div className="mt-10">
          <SubscribePlans
            trialEligible={trialEligible}
            promo={
              promo
                ? {
                    percentOff: promo.percentOff,
                    planScope: promo.planScope,
                  }
                : null
            }
          />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already subscribed?{" "}
          <Link href="/app" className="font-medium text-primary hover:underline">
            Go to the app
          </Link>
        </p>

        <p className="mx-auto mt-6 max-w-md text-balance text-center text-xs leading-relaxed text-muted-foreground">
          Subscriptions renew automatically until canceled. By subscribing you
          agree to our{" "}
          <Link href="/legal/terms" className="underline hover:text-foreground">
            Terms
          </Link>
          ,{" "}
          <Link href="/legal/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          , and{" "}
          <Link href="/legal/refund" className="underline hover:text-foreground">
            Refund Policy
          </Link>
          .
        </p>
      </main>
    </div>
  )
}
