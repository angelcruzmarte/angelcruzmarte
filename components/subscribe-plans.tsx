"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { createSubscriptionCheckout } from "@/app/actions/subscription"
import { signOut } from "@/lib/auth-client"
import { PLANS, formatPrice } from "@/lib/plans"
import { Button, buttonVariants } from "@/components/ui/button"
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

/**
 * The possible outcomes of a server-driven "Restore Purchases" attempt. Each
 * maps to a distinct, honest user-facing explanation — restore only ever
 * re-verifies the Apple subscription already linked to THIS VOXYFI account, so
 * "not found" is a real, expected state (the subscription may belong to another
 * account) and gets a recovery panel rather than a generic error.
 */
type RestoreState =
  | { kind: "idle" }
  /** Verified active — access re-granted; the handler navigates away. */
  | { kind: "success" }
  /** Not signed in — cannot restore to an anonymous user. */
  | { kind: "unauthenticated" }
  /** No Apple transaction is linked to this account (wrong account, or never subscribed here). */
  | { kind: "no_record" }
  /** Apple was queried but reports the subscription is no longer entitled (expired/refunded/revoked). */
  | { kind: "not_active" }
  /** Apple verification is unavailable (credentials not configured / API error). */
  | { kind: "unavailable" }
  /** Unexpected failure. */
  | { kind: "error" }

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
  // Structured restore outcome so the UI can explain the account-based model
  // precisely instead of collapsing every result into one vague message.
  const [restoreState, setRestoreState] = useState<RestoreState>({ kind: "idle" })
  const [signingOut, setSigningOut] = useState(false)
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

  // The web and the iOS app must show the SAME subscription price and terms.
  // The Apple IAP sheet can only charge the plain App Store Connect price (no
  // free trial or promo discount is configured there), so instead of showing a
  // richer offer on the web we bring the web DOWN to match: no 7-day trial pill,
  // no promo banner, and no discounted/strikethrough pricing on either surface.
  // Everyone sees the standard plan price. `iapAvailable` is intentionally
  // referenced so the detection effect stays meaningful for the payment rail.
  void iapAvailable
  const showWebOffers = false
  const effectiveTrialEligible = trialEligible && showWebOffers

  // The SAME plans render on every platform — no plan is ever filtered out by
  // environment. Only the payment rail differs (Apple In-App Purchase inside
  // the app, Stripe on the web), so App Review sees the full, identical plan
  // list.

  // Verify a completed native purchase on our backend before granting access.
  async function completeApplePurchase(planId: string) {
    const plan = PLANS.find((p) => p.id === planId)
    if (!plan) return
    // Diagnostic context for any native IAP failure. The SWING2APP bridge only
    // accepts a bare product id (`subscribe(productId, cb)`) — there is no slot
    // for an offer, discount, promotional identifier, or price — so
    // `offerSupplied` is ALWAYS "none". Logging this makes a StoreKit failure
    // (e.g. code 3) diagnosable from a device log without changing the native
    // wrapper. No credentials, receipts, or payment data are logged.
    const diagnostics = {
      productId: plan.appleProductId,
      planId: plan.id,
      platform: "ios-native",
      bridgeMethod: "subscribe",
      offerSupplied: "none",
    }
    console.log("[v0] Apple IAP purchase starting:", JSON.stringify(diagnostics))
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
        console.log(
          "[v0] Apple IAP purchase failed:",
          JSON.stringify({
            ...diagnostics,
            storeKitCode: err.code,
            storeKitMessage: err.message,
          }),
        )
        setError(describeApplePurchaseError(err))
      } else {
        console.log(
          "[v0] Apple IAP purchase error (non-StoreKit):",
          JSON.stringify(diagnostics),
        )
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
    setRestoreState({ kind: "idle" })
    setRestoring(true)
    try {
      const res = await fetch("/api/apple/restore", { method: "POST" })
      const data = (await res.json().catch(() => ({}))) as {
        restored?: boolean
        reason?: string
      }

      // Not signed in — restore is per VOXYFI account and can never apply to an
      // anonymous user.
      if (res.status === 401) {
        setRestoreState({ kind: "unauthenticated" })
        return
      }
      // Apple verification unavailable (credentials not configured). Fail closed.
      if (res.status === 503) {
        setRestoreState({ kind: "unavailable" })
        return
      }
      if (res.ok && data.restored) {
        setRestoreState({ kind: "success" })
        router.refresh()
        router.push("/app")
        return
      }
      // Map the server's honest reason to a precise explanation.
      switch (data.reason) {
        case "no_record":
        case "not_found":
        case "unrecognized_product":
          // No Apple transaction is linked to THIS account — most often the
          // subscription lives on a different VOXYFI account.
          setRestoreState({ kind: "no_record" })
          break
        case "not_active":
          // Apple was queried and reports the subscription is no longer
          // entitled (expired, refunded, or revoked).
          setRestoreState({ kind: "not_active" })
          break
        default:
          setRestoreState({ kind: "error" })
      }
    } catch {
      setRestoreState({ kind: "error" })
    } finally {
      setRestoring(false)
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      router.push("/sign-in")
      router.refresh()
    } catch {
      setSigningOut(false)
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
        <div className="mt-8 text-center">
          <h3 className="text-base font-semibold">Restore Premium</h3>
          {/* Accurate, account-based wording. Restore only re-verifies the
              Apple subscription already linked to THIS VOXYFI account — the
              SWING2APP native bridge exposes no StoreKit currentEntitlements /
              AppStore.sync(), so we can't discover an Apple subscription for a
              brand-new account. The copy must not promise otherwise. */}
          <p className="mx-auto mt-1 max-w-md text-pretty text-sm text-muted-foreground">
            Sign in to the VOXYFI account originally associated with your Premium
            subscription, then tap Restore Purchases. We&apos;ll verify your
            Apple subscription and restore your Premium access.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={handleRestore}
            disabled={restoring || loadingId !== null}
            className="mt-4 gap-2"
          >
            {restoring && <Loader2 className="h-4 w-4 animate-spin" />}
            Restore Purchases
          </Button>

          {restoreState.kind === "no_record" && (
            <div className="mx-auto mt-5 max-w-md rounded-2xl border border-border bg-muted/40 p-5 text-left">
              <p className="text-sm font-semibold">
                Premium subscription not found
              </p>
              <p className="mt-1 text-pretty text-sm text-muted-foreground">
                Your Apple Premium subscription is associated with a different
                VOXYFI account. Please sign in to the VOXYFI account you
                originally used when you subscribed.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="gap-2"
                >
                  {signingOut && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign out
                </Button>
                <Link
                  href="/sign-in"
                  className={buttonVariants({ variant: "secondary", size: "sm" })}
                >
                  Sign in
                </Link>
                <a
                  href="mailto:support@voxyfi.com?subject=Restore%20Premium%20help"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Contact Support
                </a>
              </div>
            </div>
          )}

          {restoreState.kind === "not_active" && (
            <p className="mx-auto mt-4 max-w-md text-pretty text-sm text-muted-foreground">
              This account&apos;s Apple subscription is no longer active. If it
              expired or was refunded, subscribe again above to regain Premium.
            </p>
          )}

          {restoreState.kind === "unauthenticated" && (
            <p className="mx-auto mt-4 max-w-md text-pretty text-sm text-muted-foreground">
              Please{" "}
              <Link href="/sign-in" className="font-medium text-primary underline">
                sign in
              </Link>{" "}
              to your VOXYFI account first, then tap Restore Purchases.
            </p>
          )}

          {restoreState.kind === "unavailable" && (
            <p className="mx-auto mt-4 max-w-md text-pretty text-sm text-muted-foreground">
              Purchase verification is temporarily unavailable. Please try again
              in a little while.
            </p>
          )}

          {restoreState.kind === "error" && (
            <p className="mx-auto mt-4 max-w-md text-pretty text-sm text-muted-foreground">
              We couldn&apos;t restore purchases right now. Please try again.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
