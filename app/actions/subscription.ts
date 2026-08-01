"use server"

import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { getPlan } from "@/lib/plans"
import { getCurrentUser } from "@/lib/session"
import { stripe } from "@/lib/stripe"
import { getBaseUrl } from "@/lib/urls"
import {
  ensureStripeCoupon,
  getActivePromotion,
} from "@/app/actions/promotions"
import { eq } from "drizzle-orm"

/** Length of the one-time free trial, in days. */
const TRIAL_DAYS = 7

/**
 * A user qualifies for the free trial only if they have never used one and
 * have never had a subscription before (new subscribers only, once).
 */
async function isTrialEligible(userId: string) {
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  const u = rows[0]
  if (!u) return false
  return !u.hasUsedTrial && !u.stripeSubscriptionId
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

  const trialEligible = await isTrialEligible(user.id)
  const subscriptionData: Record<string, unknown> = {
    metadata: { userId: user.id, planId: plan.id },
  }
  if (trialEligible) {
    // 7-day free trial. The card is still collected at checkout and the
    // subscription auto-converts to paid when the trial ends.
    subscriptionData.trial_period_days = TRIAL_DAYS
  }

  // Apply the currently-active promotion (if any) as a real Stripe discount.
  let discounts: { coupon: string }[] | undefined
  const activePromo = await getActivePromotion()
  const promoApplies =
    activePromo &&
    (activePromo.planScope === "all" || activePromo.planScope === plan.id)
  if (activePromo && promoApplies) {
    const couponId = await ensureStripeCoupon(activePromo)
    if (couponId) discounts = [{ coupon: couponId }]
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // Always collect a card, even for the trial, so it converts automatically.
    payment_method_collection: "always",
    ...(discounts ? { discounts } : {}),
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
    subscription_data: subscriptionData,
    success_url: `${baseUrl}/app?welcome=1`,
    cancel_url: `${baseUrl}/subscribe?canceled=1`,
  })

  if (!checkout.url) {
    return { error: "Could not start checkout. Please try again." }
  }
  return { url: checkout.url }
}

/**
 * Voids (or, failing that, marks uncollectible) every open invoice for a
 * customer. An "open" invoice is a finalized, unpaid invoice that Stripe keeps
 * retrying against the card via dunning ("Smart Retries"). Voiding it is what
 * actually STOPS those repeated charge attempts — cancelling the subscription
 * alone does not. VOXYFI's only recurring billing is subscriptions (one-time
 * book purchases are paid immediately at checkout), so open invoices here are
 * always failed subscription charges.
 */
async function stopOpenInvoiceRetries(customerId: string) {
  let invoices
  try {
    invoices = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      limit: 100,
    })
  } catch (error) {
    console.error("[v0] stopOpenInvoiceRetries: list failed:", error)
    return
  }

  for (const inv of invoices.data) {
    if (!inv.id) continue
    try {
      await stripe.invoices.voidInvoice(inv.id)
    } catch {
      // Some invoices can't be voided; mark uncollectible so retries stop.
      try {
        await stripe.invoices.markUncollectible(inv.id)
      } catch (error) {
        console.error("[v0] Could not stop invoice retries:", error)
      }
    }
  }
}

/**
 * Cancels the current subscription and guarantees NO further charge attempts.
 *
 * There are two cases:
 *  - Healthy plan (trialing / active): schedule cancellation at period end so
 *    the user keeps the access they've already paid for, with no future charge.
 *  - Failing plan (past_due / unpaid / incomplete): the card is being retried
 *    by Stripe's dunning on an open invoice. `cancel_at_period_end` does NOT
 *    stop those retries, so we cancel the subscription IMMEDIATELY and void the
 *    open invoice(s) to end the repeated charge attempts right away.
 *
 * This is the reliable in-app path (independent of the Stripe billing portal).
 */
export async function cancelSubscription() {
  const user = await getCurrentUser()
  if (!user?.stripeCustomerId) {
    return { error: "No billing account found." }
  }

  // Look at ALL of the customer's subscriptions from Stripe directly so we
  // never rely on a possibly-stale stored id, and so we catch duplicates.
  let subs
  try {
    subs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 20,
    })
  } catch (error) {
    console.error("[v0] cancelSubscription: failed to list:", error)
    return { error: "Could not reach billing. Please try again." }
  }

  // Anything that could still bill the card (exclude already-ended ones).
  const billable = subs.data.filter(
    (s) => s.status !== "canceled" && s.status !== "incomplete_expired",
  )
  if (billable.length === 0) {
    return { error: "No active subscription to cancel." }
  }

  try {
    let canceledImmediately = false
    for (const sub of billable) {
      const paymentIsFailing =
        sub.status === "past_due" ||
        sub.status === "unpaid" ||
        sub.status === "incomplete"

      if (paymentIsFailing) {
        // Stop the dunning retries first, then end the subscription now.
        await stopOpenInvoiceRetries(user.stripeCustomerId)
        await stripe.subscriptions.cancel(sub.id)
        canceledImmediately = true
      } else {
        await stripe.subscriptions.update(sub.id, {
          cancel_at_period_end: true,
        })
      }
    }

    // Reconcile the stored state from Stripe (status, period end, flags).
    await refreshSubscriptionFor(user.id)
    if (canceledImmediately) {
      await db
        .update(userTable)
        .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
        .where(eq(userTable.id, user.id))
    }
    return { ok: true, canceledImmediately }
  } catch (error) {
    console.error("[v0] cancelSubscription: update failed:", error)
    return { error: "Could not cancel right now. Please try again." }
  }
}

/**
 * Reverses a scheduled cancellation (before the period ends) so the plan keeps
 * renewing. Lets a user who changes their mind stay subscribed without
 * re-entering payment details.
 */
export async function resumeSubscription() {
  const user = await getCurrentUser()
  if (!user?.stripeCustomerId) {
    return { error: "No billing account found." }
  }

  let subs
  try {
    subs = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: "all",
      limit: 1,
    })
  } catch (error) {
    console.error("[v0] resumeSubscription: failed to list:", error)
    return { error: "Could not reach billing. Please try again." }
  }

  const sub = subs.data[0]
  if (!sub || sub.status === "canceled") {
    return { error: "No subscription to resume." }
  }

  try {
    const updated = await stripe.subscriptions.update(sub.id, {
      cancel_at_period_end: false,
    })
    await db
      .update(userTable)
      .set({
        subscriptionStatus: updated.status,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, user.id))
    return { ok: true }
  } catch (error) {
    console.error("[v0] resumeSubscription: update failed:", error)
    return { error: "Could not resume right now. Please try again." }
  }
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
  // Once any subscription exists (including a trialing one), the account has
  // consumed its one-time trial and won't be offered another.
  const usedTrial =
    u.hasUsedTrial || sub.status === "trialing" || Boolean(sub.trial_end)
  await db
    .update(userTable)
    .set({
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      plan: planId,
      hasUsedTrial: usedTrial,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000)
        : null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, u.id))
}
