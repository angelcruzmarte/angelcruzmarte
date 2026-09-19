import "server-only"

import {
  SignedDataVerifier,
  Environment,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library"

import { appleRootCertificates } from "./apple-root-certs"

/**
 * Server-side Apple In-App Purchase verification.
 *
 * SECURITY CONTRACT (do not weaken):
 *  - The server NEVER grants Premium or book ownership because the iOS client
 *    said a purchase happened. A client-provided "premium=true" or
 *    "purchase successful" is meaningless here.
 *  - An entitlement may only be written AFTER Apple's signed transaction data
 *    has been cryptographically verified on the server: the JWS x5c
 *    certificate chain is validated against Apple's root CAs, and the bundle id
 *    and environment are checked.
 *  - If the required credentials are absent, every function in this module
 *    throws `AppleIapNotConfiguredError`. Callers must treat that as "reject,
 *    grant nothing" — i.e. fail closed.
 *
 * This file contains NO StoreKit client code and NO fake/sample Apple
 * transactions. Verification is delegated to Apple's official
 * `@apple/app-store-server-library`.
 */

/** Thrown whenever Apple verification cannot be performed. Callers fail closed. */
export class AppleIapNotConfiguredError extends Error {
  constructor(message = "Apple IAP verification is not configured") {
    super(message)
    this.name = "AppleIapNotConfiguredError"
  }
}

/** Thrown when signed data is present but fails cryptographic verification. */
export class AppleIapVerificationError extends Error {
  constructor(message = "Apple IAP signed data failed verification") {
    super(message)
    this.name = "AppleIapVerificationError"
  }
}

/**
 * Environment variables the real verification requires. These must be added
 * (by the project owner / SWING2APP) from App Store Connect before Apple
 * purchases can be verified:
 *  - APPLE_IAP_BUNDLE_ID       the app bundle id (e.g. com.voxyfi.app)
 *  - APPLE_IAP_ISSUER_ID       App Store Connect API issuer id
 *  - APPLE_IAP_KEY_ID          the App Store Server API key id
 *  - APPLE_IAP_PRIVATE_KEY     the .p8 private key contents
 *
 * Optional:
 *  - APPLE_IAP_ENVIRONMENT     "Sandbox" | "Production" (default "Production")
 *  - APPLE_IAP_APP_APPLE_ID    numeric App Store app id (required to verify
 *                              Production App Store Server Notifications)
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

function resolveEnvironment(): Environment {
  const raw = process.env.APPLE_IAP_ENVIRONMENT?.trim().toLowerCase()
  if (raw === "sandbox") return Environment.SANDBOX
  if (raw === "production") return Environment.PRODUCTION
  // Default to Production: the safer (stricter) target for live purchases.
  return Environment.PRODUCTION
}

function resolveAppAppleId(): number | undefined {
  const raw = process.env.APPLE_IAP_APP_APPLE_ID?.trim()
  if (!raw) return undefined
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : undefined
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
  /** "Auto-Renewable Subscription", "Non-Consumable", etc. */
  productType: string
  /** Subscription expiry (null for a non-consumable book purchase). */
  expiresAt: Date | null
  /** Opaque token linking the purchase to a VOXYFI user (set by the client). */
  appAccountToken: string | null
}

let cachedVerifier: SignedDataVerifier | null = null

function getVerifier(): SignedDataVerifier {
  if (!isAppleIapConfigured()) {
    throw new AppleIapNotConfiguredError(
      "Apple IAP credentials are not set; refusing to trust any transaction data.",
    )
  }
  if (cachedVerifier) return cachedVerifier

  const bundleId = process.env.APPLE_IAP_BUNDLE_ID!.trim()
  const environment = resolveEnvironment()
  const appAppleId = resolveAppAppleId()
  // Enable online checks so revoked certificates and expired signing keys are
  // rejected using the current date rather than trusted blindly.
  cachedVerifier = new SignedDataVerifier(
    appleRootCertificates,
    true,
    environment,
    bundleId,
    appAppleId,
  )
  return cachedVerifier
}

function mapDecodedTransaction(
  payload: JWSTransactionDecodedPayload,
): VerifiedAppleTransaction {
  const originalTransactionId = payload.originalTransactionId?.trim()
  const transactionId = payload.transactionId?.trim()
  const productId = payload.productId?.trim()

  if (!originalTransactionId || !transactionId || !productId) {
    throw new AppleIapVerificationError(
      "Verified transaction is missing required identifiers.",
    )
  }

  return {
    originalTransactionId,
    transactionId,
    productId,
    productType: typeof payload.type === "string" ? payload.type : String(payload.type ?? ""),
    expiresAt:
      typeof payload.expiresDate === "number" ? new Date(payload.expiresDate) : null,
    appAccountToken: payload.appAccountToken?.trim() || null,
  }
}

/**
 * Verify a JWS `signedTransactionInfo` string from a StoreKit 2 transaction.
 *
 * Validates the JWS x5c certificate chain against Apple's root CAs and checks
 * the bundle id / environment via Apple's official library, then returns the
 * decoded, verified payload. Throws on any verification failure so the server
 * never trusts unverified data.
 */
export async function verifySignedTransaction(
  signedTransactionInfo: string,
): Promise<VerifiedAppleTransaction> {
  if (!signedTransactionInfo?.trim()) {
    throw new AppleIapVerificationError("Missing signedTransactionInfo.")
  }
  const verifier = getVerifier()
  try {
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
    return mapDecodedTransaction(decoded)
  } catch (error) {
    if (
      error instanceof AppleIapNotConfiguredError ||
      error instanceof AppleIapVerificationError
    ) {
      throw error
    }
    throw new AppleIapVerificationError(
      `Transaction verification failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Verify the JWS `signedPayload` of an App Store Server Notification (V2) and
 * return its decoded, verified transaction info.
 *
 * Validates the notification signature/certificate chain, then verifies the
 * inner `data.signedTransactionInfo` transaction the same way. Throws so a
 * forged or unverified notification can never grant an entitlement.
 */
export async function verifyNotificationPayload(
  signedPayload: string,
): Promise<VerifiedAppleTransaction> {
  if (!signedPayload?.trim()) {
    throw new AppleIapVerificationError("Missing notification signedPayload.")
  }
  const verifier = getVerifier()
  try {
    const notification = await verifier.verifyAndDecodeNotification(signedPayload)
    const signedTransactionInfo = notification.data?.signedTransactionInfo
    if (!signedTransactionInfo) {
      throw new AppleIapVerificationError(
        "Notification contained no signed transaction info to verify.",
      )
    }
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
    return mapDecodedTransaction(decoded)
  } catch (error) {
    if (
      error instanceof AppleIapNotConfiguredError ||
      error instanceof AppleIapVerificationError
    ) {
      throw error
    }
    throw new AppleIapVerificationError(
      `Notification verification failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
