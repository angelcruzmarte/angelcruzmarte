import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { appleEntitlementDeps } from "@/lib/apple/deps"
import { processApplePurchase } from "@/lib/apple/process-purchase"
import { AppleIapNotConfiguredError, isAppleIapConfigured } from "@/lib/apple/verify"

/**
 * Authenticated Apple In-App Purchase verification. The SWING2APP bridge hands
 * the WebView `{ receipt, productId, transactionId }` after StoreKit completes;
 * the client POSTs them here. Premium is granted ONLY after Apple-signed data
 * is verified server-side and bound to the signed-in VOXYFI account
 * (lib/apple/process-purchase.ts). Client fields are never trusted.
 *
 * Responses:
 *  200 { ok: true, status: "active", plan, currentPeriodEnd }  granted
 *  200 { ok: false, status: "expired" | "revoked" }            verified, not entitled
 *  202 { pending: true }                                       Apple unreachable — retry
 *  400 invalid / unrecognized product, 409 owned by another account
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
  }

  let body: { receipt?: unknown; transactionId?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  try {
    const outcome = await processApplePurchase(appleEntitlementDeps, {
      userId: session.user.id,
      receipt: typeof body.receipt === "string" ? body.receipt : "",
      transactionId:
        typeof body.transactionId === "string" ? body.transactionId : null,
    })

    switch (outcome.kind) {
      case "granted":
        return NextResponse.json({
          ok: true,
          status: "active",
          plan: outcome.entitlement.plan,
          currentPeriodEnd: outcome.entitlement.currentPeriodEnd,
        })
      case "inactive":
        return NextResponse.json({ ok: false, status: outcome.entitlement.status })
      case "pending":
        console.log("[v0] Apple purchase verification pending:", outcome.reason)
        return NextResponse.json({ pending: true }, { status: 202 })
      case "ownership_conflict":
        return NextResponse.json(
          { error: "This App Store purchase belongs to another VOXYFI account." },
          { status: 409 },
        )
      case "unrecognized_product":
        console.log("[v0] Verified Apple product has no plan:", outcome.productId)
        return NextResponse.json({ error: "Unrecognized product" }, { status: 400 })
      case "invalid":
        console.log("[v0] Apple purchase rejected:", outcome.reason)
        return NextResponse.json({ error: "Verification failed" }, { status: 400 })
    }
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) {
      return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
    }
    console.error("[v0] Apple purchase verification error:", (err as Error).message)
    return NextResponse.json({ pending: true }, { status: 202 })
  }
}
