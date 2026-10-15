import {
  AppleIapNotConfiguredError,
  AppleIapTransientError,
  AppleIapVerificationError,
} from "./errors"

/**
 * Apple entitlement orchestration for purchase, restore, and App Store Server
 * Notifications. All Apple/DB access is injected so every path is unit-tested
 * (see lib/apple/process-purchase.test.ts); production wiring is in
 * lib/apple/deps.ts.
 *
 * Invariants:
 *  - Only Apple-signed, server-verified transaction data is ever written.
 *  - An original transaction already bound to another VOXYFI account is never
 *    re-bound (one user's purchase can't unlock another account).
 *  - Writes are keyed by user + originalTransactionId, so re-verifying the same
 *    transaction updates one row instead of creating duplicates.
 *  - A temporary Apple outage yields "pending" — never a false "canceled".
 */

export type AppleTransaction = {
  originalTransactionId: string
  transactionId: string
  productId: string
  expiresAt: Date | null
  revokedAt: Date | null
  appAccountToken: string | null
  environment: string | null
}

export type AppleSubscriptionState = {
  /** Apple's current status is ACTIVE or BILLING_GRACE_PERIOD. */
  entitled: boolean
  /** Auto-renew on/off from Apple's signed renewal info; null if unknown. */
  autoRenew: boolean | null
  /** End of a billing grace period, if Apple reports one. */
  graceExpiresAt: Date | null
  /** Latest verified transaction for this subscription (may be a renewal). */
  transaction: AppleTransaction
}

export type AppleEntitlementStatus = "active" | "expired" | "revoked"

export type AppleEntitlementWrite = {
  status: AppleEntitlementStatus
  plan: string
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  appleOriginalTransactionId: string
  appleProductId: string
}

export type AppleEntitlementDeps = {
  verifyNativePurchase(input: {
    receipt: string
    transactionId: string | null
  }): Promise<AppleTransaction>
  getSubscriptionState(
    originalTransactionId: string,
  ): Promise<AppleSubscriptionState | null>
  findUserIdByOriginalTransactionId(
    originalTransactionId: string,
  ): Promise<string | null>
  getRecordedOriginalTransactionId(userId: string): Promise<string | null>
  writeEntitlement(userId: string, write: AppleEntitlementWrite): Promise<void>
  planIdForProduct(productId: string): string | null
  now(): Date
}

export function deriveAppleStatus(input: {
  expiresAt: Date | null
  revokedAt: Date | null
  appleEntitled: boolean | null
  now: Date
}): AppleEntitlementStatus {
  const now = input.now.getTime()
  if (input.revokedAt && input.revokedAt.getTime() <= now) return "revoked"
  if (input.appleEntitled === true) return "active"
  if (input.appleEntitled === false) return "expired"
  if (input.expiresAt && input.expiresAt.getTime() > now) return "active"
  return "expired"
}

function effectiveEnd(
  expiresAt: Date | null,
  graceExpiresAt: Date | null,
): Date | null {
  if (!graceExpiresAt) return expiresAt
  if (!expiresAt) return graceExpiresAt
  return graceExpiresAt > expiresAt ? graceExpiresAt : expiresAt
}

async function readStateSafely(
  deps: AppleEntitlementDeps,
  originalTransactionId: string,
): Promise<AppleSubscriptionState | null> {
  try {
    return await deps.getSubscriptionState(originalTransactionId)
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) throw err
    // The transaction itself is Apple-verified; fall back to its signed expiry.
    return null
  }
}

async function writeVerified(
  deps: AppleEntitlementDeps,
  userId: string,
  verified: AppleTransaction,
  state: AppleSubscriptionState | null,
  planId: string,
): Promise<AppleEntitlementWrite> {
  const latest =
    state &&
    state.transaction.originalTransactionId === verified.originalTransactionId
      ? state.transaction
      : verified
  const latestPlan = deps.planIdForProduct(latest.productId) ?? planId
  const status = deriveAppleStatus({
    expiresAt: latest.expiresAt,
    revokedAt: latest.revokedAt,
    appleEntitled: state ? state.entitled : null,
    now: deps.now(),
  })
  const write: AppleEntitlementWrite = {
    status,
    plan: latestPlan,
    currentPeriodEnd:
      status === "active"
        ? effectiveEnd(latest.expiresAt, state?.graceExpiresAt ?? null)
        : latest.expiresAt,
    cancelAtPeriodEnd: state?.autoRenew === false,
    appleOriginalTransactionId: latest.originalTransactionId,
    appleProductId: latest.productId,
  }
  await deps.writeEntitlement(userId, write)
  return write
}

export type PurchaseOutcome =
  | { kind: "granted"; entitlement: AppleEntitlementWrite }
  | { kind: "inactive"; entitlement: AppleEntitlementWrite }
  | { kind: "invalid"; reason: string }
  | { kind: "pending"; reason: string }
  | { kind: "unrecognized_product"; productId: string }
  | { kind: "ownership_conflict" }

export async function processApplePurchase(
  deps: AppleEntitlementDeps,
  input: { userId: string; receipt: string; transactionId: string | null },
): Promise<PurchaseOutcome> {
  if (!input.receipt && !input.transactionId) {
    return { kind: "invalid", reason: "missing_receipt" }
  }

  let verified: AppleTransaction
  try {
    verified = await deps.verifyNativePurchase({
      receipt: input.receipt,
      transactionId: input.transactionId,
    })
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) throw err
    if (err instanceof AppleIapTransientError) {
      return { kind: "pending", reason: "apple_unavailable" }
    }
    if (err instanceof AppleIapVerificationError) {
      return { kind: "invalid", reason: "verification_failed" }
    }
    return { kind: "pending", reason: "unexpected_error" }
  }

  const planId = deps.planIdForProduct(verified.productId)
  if (!planId) {
    return { kind: "unrecognized_product", productId: verified.productId }
  }

  const owner = await deps.findUserIdByOriginalTransactionId(
    verified.originalTransactionId,
  )
  if (owner && owner !== input.userId) return { kind: "ownership_conflict" }

  const state = await readStateSafely(deps, verified.originalTransactionId)
  const entitlement = await writeVerified(
    deps,
    input.userId,
    verified,
    state,
    planId,
  )
  return entitlement.status === "active"
    ? { kind: "granted", entitlement }
    : { kind: "inactive", entitlement }
}

export type RestoreOutcome =
  | { kind: "restored"; entitlement: AppleEntitlementWrite }
  | { kind: "not_active"; entitlement: AppleEntitlementWrite }
  | { kind: "no_record" }
  | { kind: "not_found" }
  | { kind: "unrecognized_product" }
  | { kind: "pending" }
  | { kind: "error" }

export async function processAppleRestore(
  deps: AppleEntitlementDeps,
  input: { userId: string },
): Promise<RestoreOutcome> {
  const originalTransactionId = await deps.getRecordedOriginalTransactionId(
    input.userId,
  )
  if (!originalTransactionId) return { kind: "no_record" }

  let state: AppleSubscriptionState | null
  try {
    state = await deps.getSubscriptionState(originalTransactionId)
  } catch (err) {
    if (err instanceof AppleIapNotConfiguredError) throw err
    if (err instanceof AppleIapTransientError) return { kind: "pending" }
    return { kind: "error" }
  }
  if (!state) return { kind: "not_found" }

  const planId = deps.planIdForProduct(state.transaction.productId)
  if (!planId) return { kind: "unrecognized_product" }

  const entitlement = await writeVerified(
    deps,
    input.userId,
    state.transaction,
    state,
    planId,
  )
  return entitlement.status === "active"
    ? { kind: "restored", entitlement }
    : { kind: "not_active", entitlement }
}

export type NotificationOutcome =
  | { kind: "applied"; userId: string; entitlement: AppleEntitlementWrite }
  | { kind: "no_owner" }
  | { kind: "unrecognized_product" }

/** Applies a verified App Store Server Notification to the owning user, if any. */
export async function processAppleNotification(
  deps: AppleEntitlementDeps,
  verified: AppleTransaction,
): Promise<NotificationOutcome> {
  const planId = deps.planIdForProduct(verified.productId)
  if (!planId) return { kind: "unrecognized_product" }

  const userId = await deps.findUserIdByOriginalTransactionId(
    verified.originalTransactionId,
  )
  if (!userId) return { kind: "no_owner" }

  const state = await readStateSafely(deps, verified.originalTransactionId)
  const entitlement = await writeVerified(deps, userId, verified, state, planId)
  return { kind: "applied", userId, entitlement }
}
