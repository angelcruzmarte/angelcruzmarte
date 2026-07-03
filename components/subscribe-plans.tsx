"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { createSubscriptionCheckout } from "@/app/actions/subscription"
import { PLANS, formatPrice } from "@/lib/plans"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function SubscribePlans() {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        {PLANS.map((plan) => (
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
              {formatPrice(plan.priceInCents)}
              <span className="text-base font-normal text-muted-foreground">
                /{plan.interval}
              </span>
            </p>

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
              Subscribe
            </Button>
          </Card>
        ))}
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
