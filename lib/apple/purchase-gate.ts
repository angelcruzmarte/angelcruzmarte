/**
 * Decides whether the iOS paywall may open Apple's purchase sheet.
 *
 * Reaching the paywall means the SERVER says this VOXYFI account has no active
 * Premium (the subscribe page redirects verified subscribers to /app). If the
 * device's Apple ID nevertheless already holds an active VOXYFI subscription,
 * that subscription belongs to a different VOXYFI account (or the server has
 * not yet recorded it). Opening the sheet again would only show Apple's
 * "You're currently subscribed" dialog and could never unlock this account,
 * so we stop and explain instead.
 *
 * The native probe is a UI hint only. It never grants Premium; a "true" result
 * can only BLOCK a duplicate purchase. Anything other than an explicit `true`
 * (false, no callback, bridge unavailable) leaves the existing purchase flow
 * untouched.
 */
export type NativeSubscriptionProbe = boolean | "unknown"

export type PurchaseGate = "proceed" | "already_subscribed"

export function decidePurchaseGate(probes: NativeSubscriptionProbe[]): PurchaseGate {
  return probes.some((p) => p === true) ? "already_subscribed" : "proceed"
}

/** The server's purchase response that means "owned by another VOXYFI account". */
export function isOwnershipConflict(status: number): boolean {
  return status === 409
}

/** Apple's own subscription management page (opens Settings > Subscriptions on iOS). */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions"
