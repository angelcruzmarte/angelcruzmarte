import "server-only"

import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

/**
 * The payment system that granted an entitlement.
 *
 * VOXYFI sells the SAME digital goods (Premium subscription + one-time book
 * ownership) through more than one payment system:
 *  - "stripe"  — the website (existing, live).
 *  - "apple"   — Apple In-App Purchase inside the iOS app (future; the native
 *                StoreKit layer is implemented by SWING2APP, the entitlement is
 *                only ever written here AFTER server-side Apple verification).
 *
 * Every existing row is "stripe" (the column default), so nothing about the
 * current web flow changes. This tag is what lets the backend distinguish the
 * source of an entitlement without duplicating the entitlement model.
 */
export type PaymentProvider = "stripe" | "apple"

/**
 * The fields that define a Premium entitlement, independent of who was paid.
 * Both the Stripe path and the (future, verified) Apple path resolve to this
 * shape so `hasActiveSubscription()` keeps working unchanged.
 */
export type PremiumEntitlementInput = {
  provider: PaymentProvider
  /** 'active' | 'trialing' | 'canceled' | 'expired' | Stripe status strings. */
  status: string
  /** Internal plan id (see lib/plans.ts), or null if unknown. */
  plan: string | null
  /** When the paid/trial period ends. Drives trial-expiry checks in session.ts. */
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd?: boolean
  // --- Stripe-specific (only set on the Stripe path) ---
  stripeSubscriptionId?: string | null
  // --- Apple-specific (only set on the verified Apple path) ---
  appleOriginalTransactionId?: string | null
  appleProductId?: string | null
}

/**
 * Writes a Premium entitlement to a user row, tagging the payment source.
 *
 * This is the single provider-agnostic write that the Apple path uses after a
 * transaction has been verified server-side (see lib/apple/verify.ts). It never
 * performs verification itself and must never be called with client-claimed
 * data — the caller is responsible for having verified the purchase first.
 *
 * The existing Stripe code writes the same user columns directly and additionally
 * tags `paymentProvider: "stripe"`, so both sources remain consistent.
 */
export async function setPremiumEntitlement(
  userId: string,
  input: PremiumEntitlementInput,
) {
  await db
    .update(userTable)
    .set({
      paymentProvider: input.provider,
      subscriptionStatus: input.status,
      plan: input.plan,
      currentPeriodEnd: input.currentPeriodEnd,
      ...(input.cancelAtPeriodEnd !== undefined
        ? { cancelAtPeriodEnd: input.cancelAtPeriodEnd }
        : {}),
      ...(input.stripeSubscriptionId !== undefined
        ? { stripeSubscriptionId: input.stripeSubscriptionId }
        : {}),
      ...(input.appleOriginalTransactionId !== undefined
        ? { appleOriginalTransactionId: input.appleOriginalTransactionId }
        : {}),
      ...(input.appleProductId !== undefined
        ? { appleProductId: input.appleProductId }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, userId))
}
