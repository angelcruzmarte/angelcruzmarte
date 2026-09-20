"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { createSubscriptionCheckout } from "@/app/actions/subscription"
import { PLANS, formatPrice } from "@/lib/plans"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  isSwingIapAvailable,
  subscribeViaApple,
  AppleNativePurchaseError,
} from "@/lib/apple/swing-bridge"

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
  const router = useRouter()

  // Detect the SWING2APP native In-App Purchase module at runtime. When present
  // (i.e. inside the module-enabled iOS app) subscribe buttons route to Apple
  // IAP as Apple requires; on the web this stays false and the existing Stripe
  // flow runs. This is capability detection, not URL-based platform hiding: the
  // same plans, prices, and buttons render either way — only the payment rail
  // differs, so nothing is hidden from App Review.
  const [iapAvailable, setIapAvailable] = useState(false)
  useEffect(() => {
    setIapAvailable(isSwingIapAvailable())
  }, [])

  // Apple offers (introductory free trials, promo discounts) are configured
  // separately in App Store Connect and are NOT the same as our web trial/promo
  // pricing. Until those Apple offers exist we don't advertise them in the IAP
  // paywall — the native purchase sheet shows the authoritative price/terms.
  const showWebOffers = !iapAvailable
  const effectiveTrialEligible = trialEligible && showWebOffers

  // Verify a completed native purchase on our backend before granting access.
  async function completeApplePurchase(planId: string) {
    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) return
    try {
      const purchase = await subscribeViaApple(plan.appleProductId)
      const res = await fetch("/api/apple/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          receipt: purchase.receipt,
        }),
      })
      if (!res.ok) {
        setError(
          "We couldn't confirm your purchase yet. If you were charged, it will unlock shortly.",
        )
        return
      }
      // Verified and granted — the subscribe page sends subscribers to the app.
      router.refresh()
      router.push("/app")
    } catch (err) {
      // A user cancellation or any non-success leaves access unchanged.
      if (err instanceof AppleNativePurchaseError) {
        setError("The purchase didn't complete. Your access is unchanged.")
      } else {
        setError("Could not start the purchase. Please try again.")
      }
    }
  }

  async function handleSubscribe(planId: string) {
    setError(null)
    setLoadingId(planId)
    try {
      if (iapAvailable) {
        await completeApplePurchase(planId)
        return
      }
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
