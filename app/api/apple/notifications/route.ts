import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { getPlanByAppleProductId } from "@/lib/plans"
import { setPremiumEntitlement } from "@/lib/entitlements"
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
  verified: VerifiedAppleTransaction,
): Promise<void> {
  // Map the verified Apple product to a Premium plan. Unknown products (e.g. a
  // book id not registered as a plan) are ignored — we never guess.
  const plan = getPlanByAppleProductId(verified.productId)
  if (!plan) {
    console.log(
      "[v0] Apple notification for unrecognized product; ignoring:",
      verified.productId,
    )
    return
  }

  // Resolve the VOXYFI user from the stable subscription id recorded when the
  // purchase was first verified (POST /api/apple/purchase). If no user owns
  // this originalTransactionId yet, there is nothing to update — the purchase
  // callback path will bind it. We never create or guess a user here.
  const rows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(
      eq(userTable.appleOriginalTransactionId, verified.originalTransactionId),
    )
    .limit(1)
  const target = rows[0]
  if (!target) {
    console.log(
      "[v0] Apple notification has no matching user for originalTransactionId; skipping.",
    )
    return
  }

  // Derive status from the verified expiry. Renewals push `expiresAt` forward
  // (active); a lapsed/expired subscription has a past expiry.
  const expired =
    verified.expiresAt !== null && verified.expiresAt.getTime() <= Date.now()

  await setPremiumEntitlement(target.id, {
    provider: "apple",
    status: expired ? "expired" : "active",
    plan: plan.id,
    currentPeriodEnd: verified.expiresAt,
    appleOriginalTransactionId: verified.originalTransactionId,
    appleProductId: verified.productId,
  })
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
