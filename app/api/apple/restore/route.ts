import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { appleEntitlementDeps } from "@/lib/apple/deps"
import { processAppleRestore } from "@/lib/apple/process-purchase"
import { AppleIapNotConfiguredError, isAppleIapConfigured } from "@/lib/apple/verify"

/**
 * Server-driven Restore Purchases. The SWING2APP bridge exposes no client
 * restore method, so for the signed-in account we re-query Apple for the
 * recorded original transaction and write Apple's CURRENT verified state.
 *
 * Responds `{ restored: boolean, reason?: string }`. reason "pending" means
 * Apple was temporarily unreachable and nothing was changed.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
  }

  try {
    const outcome = await processAppleRestore(appleEntitlementDeps, {
      userId: session.user.id,
    })
    switch (outcome.kind) {
      case "restored":
        return NextResponse.json({ restored: true, plan: outcome.entitlement.plan })
      case "not_active":
        return NextResponse.json({ restored: false, reason: "not_active" })
      default:
        return NextResponse.json({ restored: false, reason: outcome.kind })
    }
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) {
      return NextResponse.json({ error: "Apple IAP not configured" }, { status: 503 })
    }
    console.error("[v0] Apple restore failed:", (err as Error).message)
    return NextResponse.json({ restored: false, reason: "error" })
  }
}
