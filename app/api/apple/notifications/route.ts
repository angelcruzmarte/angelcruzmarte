import { NextResponse } from "next/server"
import {
  AppleIapNotConfiguredError,
  isAppleIapConfigured,
  verifyNotificationPayload,
  type VerifiedAppleTransaction,
} from "@/lib/apple/verify"

/**
 * Apple App Store Server Notifications (V2) receiver — FAIL-CLOSED scaffold.
 *
 * Apple POSTs `{ signedPayload: "<JWS>" }` here for subscription/purchase
 * lifecycle events (SUBSCRIBED, DID_RENEW, EXPIRED, DID_CHANGE_RENEWAL_STATUS,
 * REFUND, ...). This endpoint is the Apple analogue of the Stripe webhook.
 *
 * It NEVER grants an entitlement from the raw payload: the signed payload is
 * verified server-side first (lib/apple/verify.ts). Until Apple credentials are
 * configured, verification throws and this route responds 503 and grants
 * nothing — a forged or unverified notification can never unlock Premium or a
 * book. This is intentional and required; the mapping below is the prepared
 * wiring that runs only once verification succeeds.
 */

/**
 * Applies a VERIFIED Apple notification to VOXYFI's entitlement model. Only
 * reached after `verifyNotificationPayload` has cryptographically validated the
 * payload. Left as the documented integration point for SWING2APP to finish
 * (mapping Apple product ids -> plans/books and notification types -> status).
 */
async function applyVerifiedNotification(
  _verified: VerifiedAppleTransaction,
): Promise<void> {
  // Intentionally not implemented until verification is live. When it is:
  //  - auto-renewable product  -> setPremiumEntitlement(userId, { provider: "apple", ... })
  //  - non-consumable book     -> grantBookPurchase(userId, bookId, undefined, { provider: "apple", appleTransactionId })
  // The userId is resolved from the transaction's appAccountToken.
  throw new AppleIapNotConfiguredError(
    "applyVerifiedNotification() mapping is not implemented yet.",
  )
}

export async function POST(req: Request) {
  // Fail closed before doing anything else if Apple IAP isn't configured.
  if (!isAppleIapConfigured()) {
    console.log(
      "[v0] Apple notification received but Apple IAP is not configured; ignoring (granting nothing).",
    )
    return NextResponse.json(
      { error: "Apple IAP not configured" },
      { status: 503 },
    )
  }

  let signedPayload: unknown
  try {
    const body = (await req.json()) as { signedPayload?: unknown }
    signedPayload = body?.signedPayload
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  if (typeof signedPayload !== "string") {
    return NextResponse.json(
      { error: "Missing signedPayload" },
      { status: 400 },
    )
  }

  try {
    // Verify BEFORE trusting anything in the payload.
    const verified = await verifyNotificationPayload(signedPayload)
    await applyVerifiedNotification(verified)
    return NextResponse.json({ received: true })
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) {
      return NextResponse.json(
        { error: "Apple IAP not configured" },
        { status: 503 },
      )
    }
    console.log(
      "[v0] Apple notification verification failed:",
      (err as Error).message,
    )
    return NextResponse.json(
      { error: "Verification failed" },
      { status: 400 },
    )
  }
}
