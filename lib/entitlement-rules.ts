/**
 * The single authoritative Premium entitlement calculation, shared by every
 * gate (library, player, AI features, account page, banners) via
 * `hasActiveSubscription()` in lib/session.ts. Pure and dependency-free so it
 * can be unit-tested.
 */

export type EntitlementUser = {
  paymentProvider: string | null
  subscriptionStatus: string | null
  currentPeriodEnd: Date | string | null
}

function toTime(value: Date | string | null): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

/** A verified Apple subscription that has not reached its (grace-adjusted) expiry. */
export function isAppleEntitlementActive(
  u: EntitlementUser,
  now: Date = new Date(),
): boolean {
  if (u.paymentProvider !== "apple" || u.subscriptionStatus !== "active") {
    return false
  }
  const end = toTime(u.currentPeriodEnd)
  return end === null || end > now.getTime()
}

/**
 * Premium access, excluding the admin override (handled by the caller).
 *  - Apple: verified "active" AND not past the recorded expiry. This keeps
 *    access correct even if an expiry notification is missed. Turning off
 *    auto-renew does NOT end access — only expiry or revocation does.
 *  - Stripe: "active", or a "trialing" subscription whose trial hasn't ended.
 */
export function hasPremiumEntitlement(
  u: EntitlementUser | null,
  now: Date = new Date(),
): boolean {
  if (!u) return false
  if (u.paymentProvider === "apple") return isAppleEntitlementActive(u, now)
  if (u.subscriptionStatus === "active") return true
  if (u.subscriptionStatus === "trialing") {
    const end = toTime(u.currentPeriodEnd)
    return end === null || end > now.getTime()
  }
  return false
}

/**
 * Whether a Stripe reconcile (account-page sync or webhook) may overwrite the
 * user's entitlement. An inactive Stripe status (e.g. an old "canceled" web
 * trial) must never clobber a live, verified Apple subscription. A live Stripe
 * subscription may still be written — the user is paying on the web.
 */
export function shouldStripeOverwrite(
  current: EntitlementUser,
  stripeStatus: string,
  now: Date = new Date(),
): boolean {
  if (!isAppleEntitlementActive(current, now)) return true
  return stripeStatus === "active" || stripeStatus === "trialing"
}
