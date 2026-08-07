"use client"

import { useState } from "react"
import { Check, Loader2, Sparkles } from "lucide-react"
import { createSubscriptionCheckout } from "@/app/actions/subscription"
import { PLANS, formatPrice } from "@/lib/plans"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { usePlatform } from "@/hooks/use-platform"

type PromoInfo = { percentOff: number; planScope: string }

export function SubscribePlans({
  trialEligible = false,
  promo = null,
}: {
  trialEligible?: boolean
  promo?: PromoInfo | null
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { isIOS } = usePlatform()

  // Apple Guideline 3.1.1: inside the native iOS app we must not present an
  // external (non-IAP) purchase flow, prices, or links to buy elsewhere. Show
  // the Premium value and the feature list, but no pricing or checkout button.
  // On the web (and Android) the full paywall renders unchanged.
  if (isIOS) {
    const premiumFeatures = Array.from(
      new Set(PLANS.flatMap((plan) => plan.features)),
    )
    return (
      <Card className="mx-auto max-w-lg overflow-hidden p-7 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-xl font-semibold">VOXYFI Premium</h3>
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Premium unlocks the entire library with natural narration and
          word-by-word highlighting. If you already have VOXYFI Premium, it is
          active on this account&mdash;just sign in.
        </p>
        <ul className="mx-auto mt-6 flex max-w-sm flex-col gap-3 text-left">
          {premiumFeatures.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </Card>
    )
  }

  async function handleSubscribe(planId: string) {
    setError(null)
    setLoadingId(planId)
    try {
      const result = await createSubscriptionCheckout(planId)
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.url) {
        // Checkout must break out of the preview iframe if present.
        if (window.self !== window.top) {
          window.open(result.url, "_blank")
        } else {
          window.location.href = result.url
        }
      }
    } catch {
      setError("Could not start checkout. Please try again.")
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <div>
      <div className="grid gap-6 pt-3 sm:grid-cols-2">
        {PLANS.map((plan) => {
          const promoApplies =
            promo &&
            (promo.planScope === "all" || promo.planScope === plan.id)
          const discounted = promoApplies
            ? Math.round(plan.priceInCents * (1 - promo.percentOff / 100))
            : null
          return (
          <Card
            key={plan.id}
            className={
              plan.highlighted
                ? "relative overflow-visible border-primary p-7 ring-1 ring-primary"
                : "relative overflow-visible p-7"
            }
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Best value
              </span>
            )}
            <h3 className="text-lg font-semibold">{plan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.description}
            </p>
            <p className="mt-5 text-4xl font-semibold tracking-tight">
              {discounted !== null && (
                <span className="mr-2 align-middle text-xl font-normal text-muted-foreground line-through">
                  {formatPrice(plan.priceInCents)}
                </span>
              )}
              {formatPrice(discounted ?? plan.priceInCents)}
              <span className="text-base font-normal text-muted-foreground">
                /{plan.interval}
              </span>
            </p>
            {discounted !== null && (
              <p className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {promo!.percentOff}% off applied
              </p>
            )}
            {trialEligible && (
              <p className="mt-1.5 text-sm font-medium text-primary">
                7 days free, then {formatPrice(discounted ?? plan.priceInCents)}/
                {plan.interval}
              </p>
            )}

            <ul className="mt-6 flex flex-col gap-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              onClick={() => handleSubscribe(plan.id)}
              disabled={loadingId !== null}
              variant={plan.highlighted ? "default" : "secondary"}
              className="mt-7 w-full gap-2"
            >
              {loadingId === plan.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {trialEligible ? "Start free trial" : "Subscribe"}
            </Button>
          </Card>
          )
        })}
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
