"use server"

import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { getPlan } from "@/lib/plans"
import { getCurrentUser } from "@/lib/session"
import { stripe } from "@/lib/stripe"
import { eq } from "drizzle-orm"

function getBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL) ??
    "http://localhost:3000"
  )
}

/** Creates (or reuses) a Stripe customer for the current user. */
async function ensureCustomer(userId: string, email: string, name: string) {
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  const existing = rows[0]?.stripeCustomerId
  if (existing) {
    // Verify the stored customer still exists in the current Stripe mode.
    // A customer created with test keys will not resolve under live keys, so
    // we transparently recreate it instead of failing checkout.
    try {
      const customer = await stripe.customers.retrieve(existing)
      if (!("deleted" in customer) || !customer.deleted) return existing
    } catch (error) {
      console.error(
        "[v0] Stored Stripe customer is invalid, recreating:",
        error,
      )
    }
  }

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  })
  await db
    .update(userTable)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  return customer.id
}

/**
 * Starts a Stripe Checkout session in subscription mode for the given plan.
 * Returns the hosted checkout URL. Price is derived server-side from the
 * plan catalog so it cannot be tampered with on the client.
 */
export async function createSubscriptionCheckout(planId: string) {
  const user = await getCurrentUser()
  if (!user) {
    return { error: "You must be signed in to subscribe." }
  }

  const plan = getPlan(planId)
  if (!plan) {
    return { error: "Invalid plan selected." }
  }

  const customerId = await ensureCustomer(user.id, user.email, user.name)
  const baseUrl = getBaseUrl()

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan.priceInCents,
          recurring: { interval: plan.interval },
          product_data: {
            name: plan.name,
            description: plan.description,
          },
        },
      },
    ],
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: {
      metadata: { userId: user.id, planId: plan.id },
    },
    success_url: `${baseUrl}/library?welcome=1`,
    cancel_url: `${baseUrl}/subscribe?canceled=1`,
  })

  if (!checkout.url) {
    return { error: "Could not start checkout. Please try again." }
  }
  return { url: checkout.url }
}

/** Opens the Stripe billing portal so users can manage/cancel their plan. */
export async function createBillingPortalSession() {
  const user = await getCurrentUser()
  if (!user?.stripeCustomerId) {
    return { error: "No billing account found." }
  }
  const baseUrl = getBaseUrl()
  const portal = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${baseUrl}/account`,
  })
  return { url: portal.url }
}

/**
 * Reconciles subscription state directly from Stripe. Used as a fallback after
 * checkout (and on the account page) so the app stays correct even without a
 * configured webhook.
 */
export async function syncSubscription() {
  const user = await getCurrentUser()
  await refreshSubscriptionFor(user?.id ?? null)
}

/** Pulls the latest subscription for a customer and writes it to the user row. */
export async function refreshSubscriptionFor(userId: string | null) {
  if (!userId) return
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  const u = rows[0]
  if (!u?.stripeCustomerId) return

  let subs
  try {
    subs = await stripe.subscriptions.list({
      customer: u.stripeCustomerId,
      status: "all",
      limit: 1,
    })
  } catch (error) {
    // A stale customer id (e.g. a test-mode customer under live keys) throws
    // "No such customer". Clear it so the account keeps working and a fresh
    // customer is created on the next checkout.
    if (
      error instanceof Error &&
      (error as { code?: string }).code === "resource_missing"
    ) {
      await db
        .update(userTable)
        .set({ stripeCustomerId: null, updatedAt: new Date() })
        .where(eq(userTable.id, u.id))
      return
    }
    console.error("[v0] Failed to list subscriptions:", error)
    return
  }

  const sub = subs.data[0]
  if (!sub) return

  const item = sub.items.data[0]
  const planId = sub.metadata?.planId ?? null
  await db
    .update(userTable)
    .set({
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      plan: planId,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, u.id))
}
