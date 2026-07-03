import "server-only"

import Stripe from "stripe"

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Add the Stripe integration in Project Settings.",
  )
}

export const stripe = new Stripe(secretKey)
