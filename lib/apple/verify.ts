import "server-only"

/**
 * Server-side Apple In-App Purchase verification — FAIL-CLOSED scaffold.
 *
 * SECURITY CONTRACT (do not weaken):
 *  - The server NEVER grants Premium or book ownership because the iOS client
 *    said a purchase happened. A client-provided "premium=true" or
 *    "purchase successful" is meaningless here.
 *  - An entitlement may only be written AFTER Apple's signed transaction data
 *    has been cryptographically verified on the server.
 *  - Until real verification is configured, every function in this module
 *    throws `AppleIapNotConfiguredError`. Callers must treat that as "reject,
 *    grant nothing" — i.e. fail closed.
 *
 * This file intentionally contains NO StoreKit client code and NO fake/sample
 * Apple transactions. It defines the contract and the verification entry points
 * that SWING2APP (and the backend once credentials exist) will complete.
 */

/** Thrown whenever Apple verification cannot be performed. Callers fail closed. */
export class AppleIapNotConfiguredError extends Error {
  constructor(message = "Apple IAP verification is not configured") {
    super(message)
    this.name = "AppleIapNotConfiguredError"
  }
}

/**
 * Environment variables the real verification will require. These are NOT set
 * yet and must be added (by the project owner / SWING2APP) from App Store
 * Connect before Apple purchases can be verified:
 *  - APPLE_IAP_BUNDLE_ID       the app bundle id (e.g. com.voxyfi.app)
 *  - APPLE_IAP_ISSUER_ID       App Store Connect API issuer id
 *  - APPLE_IAP_KEY_ID          the In-App Purchase key id
 *  - APPLE_IAP_PRIVATE_KEY     the .p8 private key contents
 *  - APPLE_IAP_ENVIRONMENT     "Sandbox" | "Production"
 */
const REQUIRED_ENV = [
  "APPLE_IAP_BUNDLE_ID",
  "APPLE_IAP_ISSUER_ID",
  "APPLE_IAP_KEY_ID",
  "APPLE_IAP_PRIVATE_KEY",
] as const

/** True only when every credential needed for real verification is present. */
export function isAppleIapConfigured(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]?.trim()))
}

/**
 * The normalized result of a verified Apple transaction. The Apple path maps
 * this onto the provider-agnostic entitlement model (lib/entitlements.ts).
 */
export type VerifiedAppleTransaction = {
  /** Stable id for an auto-renewable subscription across renewals. */
  originalTransactionId: string
  /** Id of this specific transaction. */
  transactionId: string
  /** Apple product identifier (maps to a VOXYFI plan or book). */
  productId: string
  /** "auto-renewable" for Premium, "non-consumable" for a book, etc. */
  productType: string
  /** Subscription expiry (null for a non-consumable book purchase). */
  expiresAt: Date | null
  /** Opaque token linking the purchase to a VOXYFI user (set by the client). */
  appAccountToken: string | null
}

/**
 * Verify a JWS `signedTransactionInfo` string from a StoreKit 2 transaction.
 *
 * REAL IMPLEMENTATION (to be completed once credentials + library exist):
 *  1. Use Apple's official `@apple/app-store-server-library` to validate the
 *     JWS x5c certificate chain against Apple's root CA certificates.
 *  2. Confirm `bundleId` matches APPLE_IAP_BUNDLE_ID and the environment matches.
 *  3. Return the decoded, verified payload mapped to VerifiedAppleTransaction.
 *
 * Until then this throws — the server must not trust unverified data.
 */
export async function verifySignedTransaction(
  _signedTransactionInfo: string,
): Promise<VerifiedAppleTransaction> {
  throw new AppleIapNotConfiguredError(
    "verifySignedTransaction() requires Apple credentials and the App Store Server Library; refusing to trust unverified transaction data.",
  )
}

/**
 * Verify the JWS `signedPayload` of an App Store Server Notification (V2) and
 * return its decoded, verified transaction info.
 *
 * REAL IMPLEMENTATION mirrors verifySignedTransaction(): validate the JWS
 * signature/certificate chain with Apple's library, then decode the notification
 * (notificationType + data.signedTransactionInfo + data.signedRenewalInfo).
 *
 * Until configured this throws so an unverified/forged notification can never
 * grant an entitlement.
 */
export async function verifyNotificationPayload(
  _signedPayload: string,
): Promise<VerifiedAppleTransaction> {
  throw new AppleIapNotConfiguredError(
    "verifyNotificationPayload() requires Apple credentials and the App Store Server Library; refusing to trust unverified notification data.",
  )
}
