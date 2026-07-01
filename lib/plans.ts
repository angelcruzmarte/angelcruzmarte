export interface Plan {
  id: string
  name: string
  description: string
  priceInCents: number
  interval: "month" | "year"
  features: string[]
  highlighted?: boolean
}

// Source of truth for subscription plans. The price is validated server-side
// when creating the Stripe Checkout session — clients only send the plan id.
export const PLANS: Plan[] = [
  {
    id: "monthly",
    name: "VOXYFI Premium",
    description: "Unlimited listening, billed monthly.",
    priceInCents: 1200,
    interval: "month",
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

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
