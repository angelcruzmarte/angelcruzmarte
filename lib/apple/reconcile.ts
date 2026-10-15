import "server-only"

import { appleEntitlementDeps } from "./deps"
import { processAppleRestore } from "./process-purchase"
import { isAppleIapConfigured } from "./verify"

export type AppleReconcileResult = "synced" | "pending" | "skipped"

/**
 * Re-reads Apple's current verified state for a user who has a recorded Apple
 * subscription and writes it to the account. Used on account load and app
 * launch so renewals, auto-renew changes, and expirations are reflected even
 * when a server notification was missed. Never throws: an Apple outage reports
 * "pending" and leaves the stored entitlement untouched.
 */
export async function reconcileAppleEntitlement(user: {
  id: string
  appleOriginalTransactionId: string | null
}): Promise<AppleReconcileResult> {
  if (!user.appleOriginalTransactionId || !isAppleIapConfigured()) return "skipped"
  try {
    const outcome = await processAppleRestore(appleEntitlementDeps, { userId: user.id })
    return outcome.kind === "pending" ? "pending" : "synced"
  } catch (error) {
    console.error("[v0] Apple entitlement reconcile failed:", (error as Error).message)
    return "pending"
  }
}
