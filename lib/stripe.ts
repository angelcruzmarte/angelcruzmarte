import "server-only"

import Stripe from "stripe"

// Prefer an explicit, integration-independent override when present. A
// connected Stripe *integration* owns `STRIPE_SECRET_KEY`, so a manually-set
// value there can be overridden by the integration. `STRIPE_LIVE_SECRET_KEY`
// is a plain project variable no integration manages, so it reliably wins.
// Falls back to the integration-provided key when the override isn't set.
const secretKey =
  process.env.STRIPE_LIVE_SECRET_KEY?.trim() || process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Add the Stripe integration in Project Settings.",
  )
}

// Guardrail: catch the easy-to-miss case where production is running against a
// TEST Stripe key (so no real cards are ever charged). This commonly happens
// when a test-mode Stripe integration keeps injecting its key and overrides a
// manually-set live key. We only warn (never crash) so test/preview keep working.
const isTestKey = secretKey.startsWith("sk_test_")
const isProdRuntime =
  process.env.VERCEL_ENV === "production" ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")

if (isTestKey && isProdRuntime) {
  console.warn(
    "[v0] ⚠️ Stripe is using a TEST key (sk_test_…) in a PRODUCTION deployment. " +
      "Real customers will NOT be charged. Switch the connected Stripe integration " +
      "to live mode, or disconnect the test-mode integration so the live " +
      "STRIPE_SECRET_KEY (sk_live_…) takes effect.",
  )
}

/** True when the app is running against Stripe's live mode (real charges). */
export const stripeIsLiveMode = secretKey.startsWith("sk_live_")

export const stripe = new Stripe(secretKey)
