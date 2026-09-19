import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import {
  AppleIapNotConfiguredError,
  isAppleIapConfigured,
  verifySignedTransaction,
} from "@/lib/apple/verify"
import { getPlanByAppleProductId } from "@/lib/plans"
import { setPremiumEntitlement } from "@/lib/entitlements"

/**
 * Authenticated Apple In-App Purchase verification endpoint.
 *
 * The SWING2APP native module completes the StoreKit purchase and hands the
 * WebView JavaScript `{ receipt, productId, transactionId }`. The client POSTs
 * those here. This route is the ONLY place an Apple purchase becomes an
 * entitlement, and it does so ONLY after server-side verification:
 *
 *   1. Require a logged-in VOXYFI session — the purchase is bound to THAT user
 *      (per the guide: "Require a Voxyfi login before purchase. Associate the
 *      request with the authenticated account on your server.").
 *   2. Fail closed if Apple IAP credentials are not configured (503).
 *   3. Verify the transaction with Apple. Browser-supplied fields are treated
 *      as untrusted; the VERIFIED payload is the source of truth.
 *   4. Map the verified Apple product id to a Premium plan and write the
 *      entitlement, tagged `provider: "apple"`. Idempotent (keyed by user).
 *
 * Until Apple credentials exist, step 3 throws and this route grants nothing.
 */

type PurchaseBody = {
  productId?: unknown
  transactionId?: unknown
  receipt?: unknown
}

export async function POST(req: Request) {
  // 1. Require an authenticated VOXYFI user.
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id

  // 2. Fail closed before trusting any purchase data.
  if (!isAppleIapConfigured()) {
    console.log(
      "[v0] Apple purchase received but Apple IAP is not configured; granting nothing.",
    )
    return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
  }

  let body: PurchaseBody
  try {
    body = (await req.json()) as PurchaseBody
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const receipt = typeof body.receipt === "string" ? body.receipt : ""
  if (!receipt) {
    return NextResponse.json({ error: "Missing receipt" }, { status: 400 })
  }

  try {
    // 3. Verify with Apple. The decoded, verified transaction — NOT the
    // client-supplied fields — is authoritative for product and expiry.
    const verified = await verifySignedTransaction(receipt)

    // 4. Map the verified product to a Premium plan. Anything we don't
    // recognize (e.g. a book product id that isn't registered yet) is rejected
    // so we never grant an entitlement we can't map.
    const plan = getPlanByAppleProductId(verified.productId)
    if (!plan) {
      console.log(
        "[v0] Verified Apple product has no matching plan:",
        verified.productId,
      )
      return NextResponse.json(
        { error: "Unrecognized product" },
        { status: 400 },
      )
    }

    const expired =
      verified.expiresAt !== null && verified.expiresAt.getTime() <= Date.now()

    await setPremiumEntitlement(userId, {
      provider: "apple",
      status: expired ? "expired" : "active",
      plan: plan.id,
      currentPeriodEnd: verified.expiresAt,
      appleOriginalTransactionId: verified.originalTransactionId,
      appleProductId: verified.productId,
    })

    return NextResponse.json({
      ok: true,
      plan: plan.id,
      status: expired ? "expired" : "active",
    })
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) {
      return NextResponse.json(
        { error: "Apple IAP not configured" },
        { status: 503 },
      )
    }
    console.log("[v0] Apple purchase verification failed:", (err as Error).message)
    return NextResponse.json({ error: "Verification failed" }, { status: 400 })
  }
}
