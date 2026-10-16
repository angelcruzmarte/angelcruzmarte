import { afterEach, describe, expect, it, vi } from "vitest"
import { decidePurchaseGate, isOwnershipConflict } from "./purchase-gate"
import { probeNativeSubscription } from "./swing-bridge"
import { hasPremiumEntitlement } from "../entitlement-rules"

describe("decidePurchaseGate", () => {
  it("blocks reopening the sheet when either product reports an active Apple subscription", () => {
    expect(decidePurchaseGate([true, false])).toBe("already_subscribed")
    expect(decidePurchaseGate([false, true])).toBe("already_subscribed")
  })

  it("keeps the existing purchase flow when nothing is subscribed", () => {
    expect(decidePurchaseGate([false, false])).toBe("proceed")
  })

  it("never blocks on an unknown or missing native answer", () => {
    expect(decidePurchaseGate(["unknown", "unknown"])).toBe("proceed")
    expect(decidePurchaseGate([])).toBe("proceed")
  })

  it("treats only HTTP 409 as an ownership conflict", () => {
    expect(isOwnershipConflict(409)).toBe(true)
    expect(isOwnershipConflict(200)).toBe(false)
    expect(isOwnershipConflict(202)).toBe(false)
  })

  it("a native 'subscribed' hint alone never grants Premium to an account without a verified record", () => {
    // Signed-in account with no Apple record (the KC case): server entitlement stays free.
    expect(
      hasPremiumEntitlement({ paymentProvider: "stripe", subscriptionStatus: null, currentPeriodEnd: null }),
    ).toBe(false)
  })
})

describe("probeNativeSubscription", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  function stubBridge(isSubscribed: (id: string, cb: (v: boolean) => void) => void) {
    vi.stubGlobal("window", { swingWebViewPlugin: { app: { inapp: { isSubscribed } } } })
  }

  it("returns 'unknown' when the native bridge is absent (web)", async () => {
    vi.stubGlobal("window", {})
    await expect(probeNativeSubscription("p")).resolves.toBe("unknown")
  })

  it("returns the native boolean when the bridge answers", async () => {
    stubBridge((_id, cb) => cb(true))
    await expect(probeNativeSubscription("p")).resolves.toBe(true)
    stubBridge((_id, cb) => cb(false))
    await expect(probeNativeSubscription("p")).resolves.toBe(false)
  })

  it("returns 'unknown' when the bridge never calls back", async () => {
    vi.useFakeTimers()
    stubBridge(() => {})
    const result = probeNativeSubscription("p", 1000)
    vi.advanceTimersByTime(1001)
    await expect(result).resolves.toBe("unknown")
  })
})
