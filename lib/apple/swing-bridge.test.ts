import { describe, expect, it } from "vitest"
import { AppleNativePurchaseError, parseNativePurchasePayload } from "./swing-bridge"

const PRODUCT = "voxyfi.premium.monthly"

describe("parseNativePurchasePayload", () => {
  it("forwards the documented success payload", () => {
    const result = parseNativePurchasePayload(
      1,
      JSON.stringify({ receipt: "MIIR", productId: PRODUCT, transaction: { transactionIdentifier: "2000001" } }),
      PRODUCT,
    )
    expect(result).toEqual({ receipt: "MIIR", productId: PRODUCT, transactionId: "2000001" })
  })

  it("forwards a sandbox purchase reported with a non-1 code when it carries a transaction id", () => {
    const result = parseNativePurchasePayload(0, { transactionId: 2000002 }, PRODUCT)
    expect(result).toEqual({ receipt: "", productId: PRODUCT, transactionId: "2000002" })
  })

  it("accepts alternate receipt key names", () => {
    const result = parseNativePurchasePayload("1", JSON.stringify({ receiptData: "MIIR" }), PRODUCT)
    expect(result).toEqual({ receipt: "MIIR", productId: PRODUCT, transactionId: null })
  })

  it("treats a cancellation with no verifiable data as a failure", () => {
    const result = parseNativePurchasePayload(2, "cancelled", PRODUCT)
    expect(result).toBeInstanceOf(AppleNativePurchaseError)
    expect((result as AppleNativePurchaseError).code).toBe(2)
  })

  it("rejects a success code with an empty payload", () => {
    const result = parseNativePurchasePayload(1, "{}", PRODUCT)
    expect(result).toBeInstanceOf(AppleNativePurchaseError)
  })
})
