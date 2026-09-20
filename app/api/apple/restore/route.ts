import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import {
  AppleIapNotConfiguredError,
  isAppleIapConfigured,
  restoreByOriginalTransactionId,
} from "@/lib/apple/verify"
import { getPlanByAppleProductId } from "@/lib/plans"
import {
  getAppleOriginalTransactionId,
  setPremiumEntitlement,
} from "@/lib/entitlements"

/**
 * Server-driven "Restore Purchases" for iOS.
 *
 * The SWING2APP module documents no client restore method, so restoration is
 * performed here: for the signed-in VOXYFI user we look up the Apple original
 * transaction id we recorded at purchase time, re-query Apple's App Store
 * Server API for its CURRENT status, verify the signed transaction Apple
 * returns, and re-grant the entitlement only if Apple still reports it as
 * valid. A client claim is never trusted, and nothing is granted when Apple IAP
 * is unconfigured (fail closed → 503).
 *
 * Responds `{ restored: boolean, reason?: string }` so the client can steer the
 * UI without leaking verification detail.
 */
export async function POST() {
  // 1. Require an authenticated VOXYFI user — restore is per account.
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  // 2. Fail closed before trusting or restoring anything.
  if (!isAppleIapConfigured()) {
    console.log(
      "[v0] Apple restore requested but Apple IAP is not configured; granting nothing.",
    )
    return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
  }

  // 3. We can only restore a transaction we previously recorded for this user.
  const originalTransactionId = await getAppleOriginalTransactionId(userId)
  if (!originalTransactionId) {
    return NextResponse.json({ restored: false, reason: "no_record" })
  }

  try {
    // 4. Ask Apple for the current, verified status of that transaction.
    const restored = await restoreByOriginalTransactionId(originalTransactionId)
    if (!restored) {
      return NextResponse.json({ restored: false, reason: "not_found" })
    }

    const { transaction, entitled } = restored
    const plan = getPlanByAppleProductId(transaction.productId)
    if (!plan) {
      console.log(
        "[v0] Restored Apple product has no matching plan:",
        transaction.productId,
      )
      return NextResponse.json({ restored: false, reason: "unrecognized_product" })
    }

    const expired =
      transaction.expiresAt !== null &&
      transaction.expiresAt.getTime() <= Date.now()
    const active = entitled && !expired

    // 5. Write the verified state. If Apple no longer considers it active we
    // still record the truthful status rather than granting access.
    await setPremiumEntitlement(userId, {
      provider: "apple",
      status: active ? "active" : "expired",
      plan: plan.id,
      currentPeriodEnd: transaction.expiresAt,
      appleOriginalTransactionId: transaction.originalTransactionId,
      appleProductId: transaction.productId,
    })

    if (!active) {
      return NextResponse.json({ restored: false, reason: "not_active" })
    }
    return NextResponse.json({ restored: true, plan: plan.id })
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) {
      return NextResponse.json(
        { error: "Apple IAP not configured" },
        { status: 503 },
      )
    }
    console.log("[v0] Apple restore failed:", (err as Error).message)
    return NextResponse.json({ restored: false, reason: "error" })
  }
}
