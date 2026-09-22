"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import { PLANS, formatPrice } from "@/lib/plans"
import { PromoCountdown } from "@/components/promo-countdown"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { usePlatform } from "@/hooks/use-platform"

// A promotion that is safe to hand to the client (Dates already serialized).
export interface HomePromo {
  percentOff: number
  name: string
  description: string | null
  endsAt: string | null
  planScope: "all" | "monthly" | "yearly"
}

/**
 * Whether the WEB promotional/discount UI may be shown to THIS client.
 *
 * Apple Guideline 3.1.1: inside the native iOS app we must not advertise a
 * discounted price for a digital subscription that is actually sold through
 * App Store In-App Purchase at Apple's configured price. So all "% off",
 * strikethrough, and limited-time promo surfaces are WEB-only.
 *
 * iOS vs. web is detected from the real WKWebView marker (usePlatform), never a
 * URL flag or User-Agent. We also require `mounted` so the FIRST paint (which
 * matches the "web" SSR snapshot) renders NO discount: on iOS the promo is
 * therefore never shown even for a frame, and on the web it appears right after
 * hydration. Fails closed — if detection is uncertain, no discount is shown.
 */
function useWebPromoVisible(promo: HomePromo | null): promo is HomePromo {
  const { isIOS } = usePlatform()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return Boolean(promo) && mounted && !isIOS
}

/**
 * Hero eyebrow. Shows the promo pill on web while a promo is live, and the
 * neutral tagline everywhere else (including inside the iOS app).
 */
export function PromoHeroBadge({ promo }: { promo: HomePromo | null }) {
  const showPromo = useWebPromoVisible(promo)

  if (showPromo) {
    return (
      <a
        href="/sign-up"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Limited time: {promo.percentOff}% off Premium
      </a>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
      <Sparkles className="h-3.5 w-3.5 text-primary" />
      Listen to anything, anywhere
    </span>
  )
}

/**
 * Pricing preview cards. On web with a live promo we render the limited-time
 * banner plus strikethrough/discounted prices; on iOS (and before hydration)
 * we render the plain, authoritative prices with no discount UI.
 */
export function HomePricing({ promo }: { promo: HomePromo | null }) {
  const showPromo = useWebPromoVisible(promo)

  return (
    <>
      {showPromo && (
        <div className="mx-auto mt-8 max-w-lg overflow-hidden rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Limited-time offer
          </p>
          <p className="mt-1 text-balance text-xl font-semibold">
            {promo.name} &mdash; {promo.percentOff}% off Premium
          </p>
          {promo.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {promo.description}
            </p>
          )}
          <PromoCountdown endsAt={promo.endsAt} />
          <p className="mt-3 text-sm font-medium text-primary">
            Sign up now &mdash; discount applied automatically at checkout
          </p>
        </div>
      )}

      <div className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
        {PLANS.map((plan) => {
          const discounted =
            showPromo &&
            (promo.planScope === "all" || promo.planScope === plan.id)
              ? Math.round(plan.priceInCents * (1 - promo.percentOff / 100))
              : null
          return (
            <Card
              key={plan.id}
              className={
                plan.highlighted
                  ? "border-primary p-6 ring-1 ring-primary"
                  : "p-6"
              }
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{plan.name}</h3>
                {plan.highlighted && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                    Best value
                  </span>
                )}
              </div>
              <p className="mt-3 text-3xl font-semibold tracking-tight">
                {discounted !== null && (
                  <span className="mr-2 align-middle text-lg font-normal text-muted-foreground line-through">
                    {formatPrice(plan.priceInCents)}
                  </span>
                )}
                {formatPrice(discounted ?? plan.priceInCents)}
                <span className="text-base font-normal text-muted-foreground">
                  /{plan.interval}
                </span>
              </p>
              {showPromo && discounted !== null && (
                <p className="mt-1.5 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Save {promo.percentOff}% for a limited time
                </p>
              )}
              <Link
                href="/sign-up"
                className={
                  buttonVariants({
                    variant: plan.highlighted ? "default" : "secondary",
                  }) + " mt-4 w-full"
                }
              >
                Get {plan.name}
              </Link>
            </Card>
          )
        })}
      </div>
    </>
  )
}
