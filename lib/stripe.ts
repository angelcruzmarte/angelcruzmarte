import "server-only"

import Stripe from "stripe"

// Resolve the Stripe secret key from several possible sources, because this
// project has multiple Stripe integrations connected that each expose their
// key under a different variable:
//   - STRIPE_LIVE_SECRET_KEY  → explicit manual override (plain project var)
//   - STRIPE_ACCESS_TOKEN     → the LIVE integration (stripe-live-voxyfi)
//   - STRIPE_SECRET_KEY       → the TEST integration (sandbox)
// To guarantee real charges in production, we prefer whichever source holds a
// LIVE key (sk_live_…); only if none is live do we fall back to the first
// available value. This keeps working even if the manual override is removed.
function resolveSecretKey(): string | undefined {
  const candidates = [
    process.env.STRIPE_LIVE_SECRET_KEY?.trim(),
    process.env.STRIPE_ACCESS_TOKEN?.trim(),
    process.env.STRIPE_SECRET_KEY?.trim(),
  ].filter((v): v is string => Boolean(v))

  return candidates.find((k) => k.startsWith("sk_live_")) ?? candidates[0]
}

/**
 * True when the app is running against Stripe's live mode (real charges).
 * Computed safely at import time (never throws) so importing this module during
 * `next build` page-data collection can't crash the production build.
 */
export const stripeIsLiveMode =
  resolveSecretKey()?.startsWith("sk_live_") ?? false

let cached: Stripe | null = null

/**
 * Lazily construct (and cache) the Stripe client. The key is only resolved the
 * first time Stripe is actually used at runtime — NOT at module import. This is
 * critical: instantiating Stripe at the top level made the module throw during
 * the build's "collect page data" step whenever the key wasn't present in the
 * build environment, which failed every production deployment.
 */
function getStripe(): Stripe {
  if (cached) return cached

  const secretKey = resolveSecretKey()
  if (!secretKey) {
    throw new Error(
      "No Stripe secret key found. Add the Stripe integration in Project Settings.",
    )
  }

  // Guardrail: catch the easy-to-miss case where production runs against a TEST
  // key (so no real cards are ever charged). This happens when a test-mode
  // Stripe integration keeps injecting its key and overrides a manually-set
  // live key. We only warn (never crash) so test/preview keep working.
  const isProdRuntime =
    process.env.VERCEL_ENV === "production" ||
    (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")
  if (secretKey.startsWith("sk_test_") && isProdRuntime) {
    console.warn(
      "[v0] ⚠️ Stripe is using a TEST key (sk_test_…) in a PRODUCTION deployment. " +
        "Real customers will NOT be charged. Switch the connected Stripe integration " +
        "to live mode, or disconnect the test-mode integration so the live " +
        "STRIPE_SECRET_KEY (sk_live_…) takes effect.",
    )
  }

  cached = new Stripe(secretKey)
  return cached
}

/**
 * Runtime Stripe client. Exposed as a Proxy so existing call sites
 * (`stripe.customers.create(...)`, `stripe.webhooks.constructEvent(...)`, etc.)
 * keep working unchanged, while the underlying client is only instantiated on
 * first property access — safely after the build has finished.
 */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = getStripe()
    const value = (client as unknown as Record<PropertyKey, unknown>)[prop]
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})
