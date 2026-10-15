import { NextResponse } from "next/server"
import { appleEntitlementDeps } from "@/lib/apple/deps"
import { processAppleNotification } from "@/lib/apple/process-purchase"
import {
  AppleIapNotConfiguredError,
  isAppleIapConfigured,
  verifyNotificationPayload,
} from "@/lib/apple/verify"

/**
 * App Store Server Notifications (V2): SUBSCRIBED, DID_RENEW, EXPIRED,
 * DID_CHANGE_RENEWAL_STATUS, REFUND, REVOKE, ... The signed payload is verified
 * first; the owning user is then reconciled against Apple's current status, so
 * turning off auto-renew keeps access until expiry while a refund/revoke or
 * expiry ends it. A forged or unverified payload never changes an entitlement.
 */
export async function POST(req: Request) {
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
  }

  let signedPayload: unknown
  try {
    signedPayload = ((await req.json()) as { signedPayload?: unknown })?.signedPayload
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  if (typeof signedPayload !== "string") {
    return NextResponse.json({ error: "Missing signedPayload" }, { status: 400 })
  }

  try {
    const verified = await verifyNotificationPayload(signedPayload)
    const outcome = await processAppleNotification(appleEntitlementDeps, verified)
    if (outcome.kind !== "applied") {
      console.log("[v0] Apple notification not applied:", outcome.kind)
    }
    return NextResponse.json({ received: true })
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) {
      return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
    }
    console.log("[v0] Apple notification verification failed:", (err as Error).message)
    return NextResponse.json({ error: "Verification failed" }, { status: 400 })
  }
}
