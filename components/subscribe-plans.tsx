"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { createSubscriptionCheckout } from "@/app/actions/subscription"
import { PLANS, formatPrice } from "@/lib/plans"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  waitForSwingIap,
  subscribeViaApple,
  AppleNativePurchaseError,
  describeApplePurchaseError,
} from "@/lib/apple/swing-bridge"

type PromoInfo = {
  percentOff: number
  planScope: string
  name: string
  description: string | null
  showBanner: boolean
}

export function SubscribePlans({
  trialEligible = false,
  promo = null,
}: {
  trialEligible?: boolean
  promo?: PromoInfo | null
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)
  const router = useRouter()

  // Detect the SWING2APP native In-App Purchase module at runtime. When present
  // (i.e. inside the module-enabled iOS app) subscribe buttons route to Apple
  // IAP as Apple requires; on the web this stays false and the existing Stripe
  // flow runs. This is capability detection, not URL-based platform hiding: the
  // same plans, prices, and buttons render either way — only the payment rail
  // differs, so nothing is hidden from App Review.
  //
  // The bridge is injected asynchronously after the SWING2APP library loads, so
  // we load the library and POLL for it rather than checking once at mount — a
  // one-shot check races the injection and would wrongly fall back to Stripe
  // inside the app. `detectedRef` records the final result so the click handler
  // can close the race for a tap that lands before detection settles.
  const [iapAvailable, setIapAvailable] = useState(false)
  const detectedRef = useRef<boolean | null>(null)
  useEffect(() => {
    let active = true
    waitForSwingIap().then((available) => {
      if (!active) return
      detectedRef.current = available
      setIapAvailable(available)
    })
    return () => {
      active = false
    }
  }, [])

  // Apple offers (introductory free trials, promo discounts) are configured
  // separately in App Store Connect and are NOT the same as our web trial/promo
  // pricing. Until those Apple offers exist we don't advertise them in the IAP
  // paywall — the native purchase sheet shows the authoritative price/terms.
  const showWebOffers = !iapAvailable
  const effectiveTrialEligible = trialEligible && showWebOffers

  // The SAME plans render on every platform — no plan is ever filtered out by
  // environment. Only the payment rail differs (Apple In-App Purchase inside
  // the app, Stripe on the web), so App Review sees the full, identical plan
  // list.

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
      // A user cancellation or any non-success leaves access unchanged. Surface
      // the specific native error code (mapped to a readable reason) so a
      // failing purchase is diagnosable instead of an opaque generic message.
      if (err instanceof AppleNativePurchaseError) {
        setError(describeApplePurchaseError(err))
      } else {
        setError("Could not start the purchase. Please try again.")
      }
    }
  }

  // Restore Purchases (iOS). The SWING2APP guide is explicit that the module
  // documents no client restore method and that isSubscribed() is only a status
  // hint — so restoration is done on the SERVER: we re-query Apple for the
  // signed-in user's recorded original transaction and re-grant only if Apple
  // still reports an active, verified subscription. A native "true" is never
  // trusted on its own, and nothing is granted when Apple IAP is unconfigured
  // (the endpoint fails closed).
  async function handleRestore() {
    setError(null)
    setRestoreMessage(null)
    setRestoring(true)
    try {
      const res = await fetch("/api/apple/restore", { method: "POST" })
      const data = (await res.json().catch(() => ({}))) as {
        restored?: boolean
        reason?: string
      }
      if (res.ok && data.restored) {
        router.refresh()
        router.push("/app")
        return
      }
      setRestoreMessage(
        "We couldn't find an active purchase to restore for this account. If you subscribed with a different Apple ID or account, sign in with that account.",
      )
    } catch {
      setRestoreMessage("Could not restore purchases right now. Please try again.")
    } finally {
      setRestoring(false)
    }
  }

  async function handleSubscribe(planId: string) {
    setError(null)
    setLoadingId(planId)
    try {
      // Close the mount-time race: if detection hasn't settled yet, give the
      // native bridge a brief chance before deciding the payment rail. Once
      // detection has resolved we trust that result and don't re-wait.
      const useApple =
        detectedRef.current === null ? await waitForSwingIap(2000) : iapAvailable
      if (useApple) {
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
      {/* Free-trial pill is a WEB-only (Stripe) offer. The native App Store
          purchase applies whatever introductory offer is configured in App
          Store Connect (currently none), so advertising a "7-day free trial"
          inside the app misrepresents the native terms. Gate it with
          effectiveTrialEligible (which already folds in showWebOffers) so it
          never disagrees with the plan card. */}
      {effectiveTrialEligible && (
        <p className="mx-auto mb-8 flex w-fit items-center rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
          Start with a 7-day free trial &mdash; cancel anytime
        </p>
      )}

      {/* Promo banner is a WEB-only (Stripe) offer. Inside the app the native
          App Store purchase always charges the configured App Store Connect
          price, so advertising "50% off ... at checkout" there misrepresents
          what Apple charges. Gate it with showWebOffers exactly like the plan
          card's promo pricing so the two never disagree. */}
      {showWebOffers && promo?.showBanner && (
        <div className="mx-auto mb-8 max-w-lg overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
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

      <div className="grid gap-6 pt-3 sm:grid-cols-2">
        {PLANS.map((plan) => {
          // Promo discounts are a WEB-only (Stripe) offer. Inside the app the
          // native App Store purchase always charges the product's configured
          // App Store Connect price, so advertising a discounted price there
          // would misrepresent what Apple actually charges (App Review
          // rejection + user-facing "50% off" that never applies). Gate the
          // promo behind showWebOffers exactly like the free trial above.
          const promoApplies =
            showWebOffers &&
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
            {effectiveTrialEligible && (
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
              {effectiveTrialEligible ? "Start free trial" : "Subscribe"}
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

      {iapAvailable && (
        <div className="mt-6 text-center">
          <Button
            type="button"
            variant="ghost"
            onClick={handleRestore}
            disabled={restoring || loadingId !== null}
            className="gap-2"
          >
            {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
            Restore purchases
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Already subscribed on this Apple ID? Restore your access.
          </p>
          {restoreMessage && (
            <p className="mx-auto mt-3 max-w-md text-pretty text-sm text-muted-foreground">
              {restoreMessage}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
