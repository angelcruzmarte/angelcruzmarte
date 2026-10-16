import { describe, expect, it, vi } from "vitest"
import { AppleIapTransientError, AppleIapVerificationError } from "./errors"
import {
  type AppleEntitlementDeps,
  type AppleEntitlementWrite,
  type AppleSubscriptionState,
  type AppleTransaction,
  processAppleNotification,
  processApplePurchase,
  processAppleRestore,
} from "./process-purchase"
import { hasPremiumEntitlement, shouldStripeOverwrite } from "../entitlement-rules"

const NOW = new Date("2026-10-15T12:00:00Z")
const FUTURE = new Date("2027-10-15T12:00:00Z")
const PAST = new Date("2026-09-01T12:00:00Z")

function tx(overrides: Partial<AppleTransaction> = {}): AppleTransaction {
  return {
    originalTransactionId: "otid-1",
    transactionId: "tx-1",
    productId: "com.voxyfi.premium.annual",
    expiresAt: FUTURE,
    revokedAt: null,
    appAccountToken: null,
    environment: "Sandbox",
    ...overrides,
  }
}

function makeDeps(opts: {
  verified?: AppleTransaction | Error
  state?: AppleSubscriptionState | null | Error
  owner?: string | null
  recorded?: string | null
}) {
  const writes: Array<{ userId: string; write: AppleEntitlementWrite }> = []
  const deps: AppleEntitlementDeps = {
    verifyNativePurchase: vi.fn(async () => {
      if (opts.verified instanceof Error) throw opts.verified
      return opts.verified ?? tx()
    }),
    getSubscriptionState: vi.fn(async () => {
      if (opts.state instanceof Error) throw opts.state
      return opts.state ?? null
    }),
    findUserIdByOriginalTransactionId: vi.fn(async () => opts.owner ?? null),
    getRecordedOriginalTransactionId: vi.fn(async () => opts.recorded ?? null),
    writeEntitlement: vi.fn(async (userId, write) => {
      writes.push({ userId, write })
    }),
    planIdForProduct: (id) =>
      id === "com.voxyfi.premium.annual"
        ? "annual"
        : id === "com.voxyfi.premium.monthly"
          ? "monthly"
          : null,
    now: () => NOW,
  }
  return { deps, writes }
}

describe("processApplePurchase", () => {
  it("grants an active annual subscription after successful verification", async () => {
    const { deps, writes } = makeDeps({
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: tx() },
    })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "r", transactionId: "tx-1" })
    expect(out.kind).toBe("granted")
    expect(writes).toHaveLength(1)
    expect(writes[0].write).toMatchObject({
      status: "active",
      plan: "annual",
      cancelAtPeriodEnd: false,
      appleOriginalTransactionId: "otid-1",
      currentPeriodEnd: FUTURE,
    })
  })

  it("never grants when Apple rejects the transaction", async () => {
    const { deps, writes } = makeDeps({ verified: new AppleIapVerificationError("bad") })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "forged", transactionId: null })
    expect(out.kind).toBe("invalid")
    expect(writes).toHaveLength(0)
  })

  it("rejects an empty request without calling Apple", async () => {
    const { deps } = makeDeps({})
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "", transactionId: null })
    expect(out.kind).toBe("invalid")
    expect(deps.verifyNativePurchase).not.toHaveBeenCalled()
  })

  it("reports pending (not canceled) when Apple is temporarily unavailable", async () => {
    const { deps, writes } = makeDeps({ verified: new AppleIapTransientError("503") })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "r", transactionId: "tx-1" })
    expect(out.kind).toBe("pending")
    expect(writes).toHaveLength(0)
  })

  it("refuses a purchase already bound to another account", async () => {
    const { deps, writes } = makeDeps({ owner: "someone-else" })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "r", transactionId: "tx-1" })
    expect(out.kind).toBe("ownership_conflict")
    expect(writes).toHaveLength(0)
  })

  it("rejects products that are not VOXYFI plans", async () => {
    const { deps, writes } = makeDeps({ verified: tx({ productId: "com.other.app" }) })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "r", transactionId: "tx-1" })
    expect(out.kind).toBe("unrecognized_product")
    expect(writes).toHaveLength(0)
  })

  it("keeps access when auto-renew is turned off before expiry", async () => {
    const { deps, writes } = makeDeps({
      state: { entitled: true, autoRenew: false, graceExpiresAt: null, transaction: tx() },
    })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "r", transactionId: "tx-1" })
    expect(out.kind).toBe("granted")
    expect(writes[0].write).toMatchObject({ status: "active", cancelAtPeriodEnd: true })
  })

  it("falls back to the signed transaction when the status lookup fails", async () => {
    const { deps, writes } = makeDeps({ state: new AppleIapTransientError("timeout") })
    const out = await processApplePurchase(deps, { userId: "u1", receipt: "r", transactionId: "tx-1" })
    expect(out.kind).toBe("granted")
    expect(writes[0].write.status).toBe("active")
  })
})

describe("processAppleRestore", () => {
  it("restores an active subscription for the recorded transaction", async () => {
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: tx() },
    })
    const out = await processAppleRestore(deps, { userId: "u1" })
    expect(out.kind).toBe("restored")
    expect(writes[0].write.status).toBe("active")
  })

  it("reports expired subscriptions as not active", async () => {
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: false, autoRenew: false, graceExpiresAt: null, transaction: tx({ expiresAt: PAST }) },
    })
    const out = await processAppleRestore(deps, { userId: "u1" })
    expect(out.kind).toBe("not_active")
    expect(writes[0].write.status).toBe("expired")
  })

  it("does nothing when there is no recorded Apple purchase", async () => {
    const { deps, writes } = makeDeps({ recorded: null })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("no_record")
    expect(writes).toHaveLength(0)
  })

  it("leaves the entitlement untouched while Apple is unavailable", async () => {
    const { deps, writes } = makeDeps({ recorded: "otid-1", state: new AppleIapTransientError("503") })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("pending")
    expect(writes).toHaveLength(0)
  })

  it("queries Apple with the account's recorded original transaction and never trusts a client receipt", async () => {
    const { deps } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: tx() },
    })
    await processAppleRestore(deps, { userId: "u1" })
    expect(deps.getRecordedOriginalTransactionId).toHaveBeenCalledWith("u1")
    expect(deps.getSubscriptionState).toHaveBeenCalledWith("otid-1")
    expect(deps.verifyNativePurchase).not.toHaveBeenCalled()
  })

  it("grants nothing when Apple has no record of the transaction", async () => {
    const { deps, writes } = makeDeps({ recorded: "otid-1", state: null })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("not_found")
    expect(writes).toHaveLength(0)
  })

  it("grants nothing when Apple's signed data fails verification", async () => {
    const { deps, writes } = makeDeps({ recorded: "otid-1", state: new AppleIapVerificationError("bad jws") })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("error")
    expect(writes).toHaveLength(0)
  })

  it("grants nothing for a product that is not a VOXYFI plan", async () => {
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: tx({ productId: "com.other.app" }) },
    })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("unrecognized_product")
    expect(writes).toHaveLength(0)
  })

  it("restores the monthly plan with Apple's latest renewal period", async () => {
    const renewed = tx({ productId: "com.voxyfi.premium.monthly", transactionId: "tx-9" })
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: renewed },
    })
    const out = await processAppleRestore(deps, { userId: "u1" })
    expect(out.kind).toBe("restored")
    expect(writes[0]).toMatchObject({
      userId: "u1",
      write: {
        status: "active",
        plan: "monthly",
        currentPeriodEnd: FUTURE,
        appleOriginalTransactionId: "otid-1",
        appleProductId: "com.voxyfi.premium.monthly",
      },
    })
  })

  it("keeps access through a billing grace period", async () => {
    const grace = new Date("2026-10-30T12:00:00Z")
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: grace, transaction: tx({ expiresAt: PAST }) },
    })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("restored")
    expect(writes[0].write).toMatchObject({ status: "active", currentPeriodEnd: grace })
  })

  it("does not restore a refunded (revoked) subscription", async () => {
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: false, graceExpiresAt: null, transaction: tx({ revokedAt: PAST }) },
    })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("not_active")
    expect(writes[0].write.status).toBe("revoked")
  })

  it("records auto-renew off so the account shows it ends at period end", async () => {
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: false, graceExpiresAt: null, transaction: tx() },
    })
    expect((await processAppleRestore(deps, { userId: "u1" })).kind).toBe("restored")
    expect(writes[0].write.cancelAtPeriodEnd).toBe(true)
  })

  it("a restored entitlement unlocks Premium under the app's gating rule", async () => {
    const { deps, writes } = makeDeps({
      recorded: "otid-1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: tx() },
    })
    await processAppleRestore(deps, { userId: "u1" })
    const w = writes[0].write
    expect(
      hasPremiumEntitlement({
        paymentProvider: "apple",
        subscriptionStatus: w.status,
        currentPeriodEnd: w.currentPeriodEnd,
        cancelAtPeriodEnd: w.cancelAtPeriodEnd,
      } as Parameters<typeof hasPremiumEntitlement>[0], NOW),
    ).toBe(true)
  })
})

describe("processAppleNotification", () => {
  it("renews the owning user's period on DID_RENEW", async () => {
    const renewed = tx({ transactionId: "tx-2", expiresAt: new Date("2028-10-15T12:00:00Z") })
    const { deps, writes } = makeDeps({
      owner: "u1",
      state: { entitled: true, autoRenew: true, graceExpiresAt: null, transaction: renewed },
    })
    const out = await processAppleNotification(deps, renewed)
    expect(out.kind).toBe("applied")
    expect(writes[0].write).toMatchObject({ status: "active", currentPeriodEnd: renewed.expiresAt })
  })

  it("ends access after a refund or revocation", async () => {
    const revoked = tx({ revokedAt: PAST })
    const { deps, writes } = makeDeps({
      owner: "u1",
      state: { entitled: false, autoRenew: false, graceExpiresAt: null, transaction: revoked },
    })
    await processAppleNotification(deps, revoked)
    expect(writes[0].write.status).toBe("revoked")
  })

  it("ignores notifications for unknown purchases", async () => {
    const { deps, writes } = makeDeps({ owner: null })
    expect((await processAppleNotification(deps, tx())).kind).toBe("no_owner")
    expect(writes).toHaveLength(0)
  })
})

describe("entitlement rules", () => {
  const appleActive = { paymentProvider: "apple", subscriptionStatus: "active", currentPeriodEnd: FUTURE }

  it("treats an unexpired Apple subscription as Premium", () => {
    expect(hasPremiumEntitlement(appleActive, NOW)).toBe(true)
  })

  it("does not treat an expired Apple period as Premium", () => {
    expect(hasPremiumEntitlement({ ...appleActive, currentPeriodEnd: PAST }, NOW)).toBe(false)
  })

  it("a stale canceled Stripe subscription cannot overwrite a live Apple one", () => {
    expect(shouldStripeOverwrite(appleActive, "canceled", NOW)).toBe(false)
    expect(shouldStripeOverwrite(appleActive, "incomplete_expired", NOW)).toBe(false)
  })

  it("a live Stripe subscription may still be written", () => {
    expect(shouldStripeOverwrite(appleActive, "active", NOW)).toBe(true)
  })

  it("Stripe may update users without a live Apple subscription", () => {
    expect(
      shouldStripeOverwrite({ paymentProvider: "stripe", subscriptionStatus: "active", currentPeriodEnd: FUTURE }, "canceled", NOW),
    ).toBe(true)
  })
})
