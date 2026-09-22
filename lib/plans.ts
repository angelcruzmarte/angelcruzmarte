export interface Plan {
  id: string
  name: string
  description: string
  priceInCents: number
  interval: "month" | "year"
  features: string[]
  highlighted?: boolean
  /**
   * App Store Connect product identifier for the SAME Premium plan sold via
   * Apple In-App Purchase inside the iOS app. Register these exact ids in App
   * Store Connect (auto-renewable subscriptions). The web/Stripe flow ignores
   * this field; it is only used to route a purchase to Apple and to map a
   * server-verified Apple transaction back to this plan.
   */
  appleProductId: string
}

// Source of truth for subscription plans. The price is validated server-side
// when creating the Stripe Checkout session — clients only send the plan id.
export const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "VOXYFI Premium",
    description: "Unlimited listening, billed monthly.",
    priceInCents: 1299,
    interval: "month",
    appleProductId: "com.voxyfi.premium.monthly",
    features: [
      "Unlimited access to the full library",
      "Natural word-by-word highlighting",
      "Adjustable speed and voices",
      "New titles added every week",
    ],
  },
  {
    id: "yearly",
    name: "VOXYFI Premium Annual",
    description: "Unlimited listening, billed yearly. Save 30%.",
    priceInCents: 9900,
    interval: "year",
    appleProductId: "com.voxyfi.premium.annual",
    features: [
      "Everything in Premium",
      "Two months free vs. monthly",
      "Priority access to new voices",
      "Cancel anytime",
    ],
    highlighted: true,
  },
]

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id)
}

/**
 * Maps a server-VERIFIED Apple product identifier back to a VOXYFI plan. Used
 * by the Apple purchase endpoint and the App Store Server Notifications handler
 * to translate a verified transaction into an internal plan id. Returns
 * undefined for any product id that is not a known Premium plan (e.g. a book or
 * an unrecognized id), so the caller can fail closed and grant nothing.
 */
export function getPlanByAppleProductId(appleProductId: string): Plan | undefined {
  return PLANS.find((p) => p.appleProductId === appleProductId)
}

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
