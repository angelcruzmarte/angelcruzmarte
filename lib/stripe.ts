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
const candidates = [
  process.env.STRIPE_LIVE_SECRET_KEY?.trim(),
  process.env.STRIPE_ACCESS_TOKEN?.trim(),
  process.env.STRIPE_SECRET_KEY?.trim(),
].filter((v): v is string => Boolean(v))

const secretKey =
  candidates.find((k) => k.startsWith("sk_live_")) ?? candidates[0]

if (!secretKey) {
  throw new Error(
    "No Stripe secret key found. Add the Stripe integration in Project Settings.",
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
