import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import {
  getAppleOriginalTransactionId,
  setPremiumEntitlement,
} from "@/lib/entitlements"
import { getPlanByAppleProductId } from "@/lib/plans"
import type { AppleEntitlementDeps } from "./process-purchase"
import { getAppleSubscriptionState, verifyNativePurchase } from "./verify"

/** Production wiring for the Apple entitlement orchestrator. */
export const appleEntitlementDeps: AppleEntitlementDeps = {
  verifyNativePurchase,
  getSubscriptionState: getAppleSubscriptionState,
  async findUserIdByOriginalTransactionId(originalTransactionId) {
    const rows = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(eq(userTable.appleOriginalTransactionId, originalTransactionId))
      .limit(1)
    return rows[0]?.id ?? null
  },
  getRecordedOriginalTransactionId: getAppleOriginalTransactionId,
  async writeEntitlement(userId, write) {
    await setPremiumEntitlement(userId, {
      provider: "apple",
      status: write.status,
      plan: write.plan,
      currentPeriodEnd: write.currentPeriodEnd,
      cancelAtPeriodEnd: write.cancelAtPeriodEnd,
      appleOriginalTransactionId: write.appleOriginalTransactionId,
      appleProductId: write.appleProductId,
    })
  },
  planIdForProduct: (productId) => getPlanByAppleProductId(productId)?.id ?? null,
  now: () => new Date(),
}
