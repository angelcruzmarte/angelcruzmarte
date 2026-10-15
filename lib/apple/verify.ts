import "server-only"

import { createPrivateKey } from "node:crypto"

import {
  SignedDataVerifier,
  AppStoreServerAPIClient,
  APIException,
  Environment,
  Status,
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

import {
  AppleIapNotConfiguredError,
  AppleIapTransientError,
  AppleIapVerificationError,
} from "./errors"
import type {
  AppleSubscriptionState,
  AppleTransaction,
} from "./process-purchase"

export {
  AppleIapNotConfiguredError,
  AppleIapTransientError,
  AppleIapVerificationError,
}

/**
 * Environment variables the real verification requires. These must be added
 * (by the project owner / SWING2APP) from App Store Connect before Apple
 * purchases can be verified:
 *  - APPLE_IAP_BUNDLE_ID       the bundle id that SIGNS the StoreKit
 *                              transactions. For this app that is the
 *                              Swing2App wrapper bundle id
 *                              "com.swing2app.v3.dc6a9e3d28fbd42039467641b6da1ff9d",
 *                              NOT "com.voxyfi.app". It must match the
 *                              `bundleId` inside Apple's signed transaction.
 *  - APPLE_IAP_ISSUER_ID       App Store Connect API issuer id
 *  - APPLE_IAP_KEY_ID          the App Store Server API key id
 *  - APPLE_IAP_PRIVATE_KEY     the .p8 private key contents
 *
 * Optional:
 *  - APPLE_IAP_ENVIRONMENT     "Sandbox" | "Production" — the environment tried
 *                              FIRST (default "Production"). Verification always
 *                              falls back to the other environment on an
 *                              environment mismatch, so a single deployment
 *                              handles both TestFlight (Sandbox-signed) and
 *                              live App Store (Production-signed) transactions.
 *                              TestFlight builds — even production-signed ones
 *                              with beta-reports-active — emit Sandbox
 *                              transactions.
 *  - APPLE_IAP_APP_APPLE_ID    numeric App Store app id (required to verify
 *                              Production App Store Server Notifications)
 */
const REQUIRED_ENV = [
  "APPLE_IAP_BUNDLE_ID",
  "APPLE_IAP_ISSUER_ID",
  "APPLE_IAP_KEY_ID",
] as const

/**
 * The private key may be supplied either as a single `APPLE_IAP_PRIVATE_KEY`
 * value or split across `APPLE_IAP_PRIVATE_KEY_PART1`, `_PART2`, … The split
 * form exists because some env-var entry forms wrap long values at 64 chars and
 * drop the final characters of the last wrapped line, silently truncating the
 * key. Short parts never wrap, so nothing is lost. Present = any of these set.
 */
function hasApplePrivateKeyMaterial(): boolean {
  return (
    Boolean(process.env.APPLE_IAP_PRIVATE_KEY?.trim()) ||
    Boolean(process.env.APPLE_IAP_PRIVATE_KEY_PART1?.trim())
  )
}

/** True only when every credential needed for real verification is present. */
export function isAppleIapConfigured(): boolean {
  return (
    REQUIRED_ENV.every((key) => Boolean(process.env[key]?.trim())) &&
    hasApplePrivateKeyMaterial()
  )
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
  /** Set when Apple refunded or revoked the transaction. */
  revokedAt: Date | null
  /** "Sandbox" (TestFlight) or "Production". */
  environment: string | null
}

const verifierCache = new Map<Environment, SignedDataVerifier>()

function buildVerifier(environment: Environment): SignedDataVerifier {
  const cached = verifierCache.get(environment)
  if (cached) return cached

  const bundleId = process.env.APPLE_IAP_BUNDLE_ID!.trim()
  const appAppleId = resolveAppAppleId()
  // Enable online checks so revoked certificates and expired signing keys are
  // rejected using the current date rather than trusted blindly.
  const verifier = new SignedDataVerifier(
    appleRootCertificates,
    true,
    environment,
    bundleId,
    appAppleId,
  )
  verifierCache.set(environment, verifier)
  return verifier
}

/**
 * The order of environments to attempt. The configured environment is tried
 * first; the other is the fallback. A SignedDataVerifier is bound to a single
 * environment and rejects transactions signed in the other with an environment
 * mismatch — so to accept both TestFlight (Sandbox) and live App Store
 * (Production) traffic from one deployment, we try both.
 */
function environmentAttemptOrder(): Environment[] {
  const primary = resolveEnvironment()
  const secondary =
    primary === Environment.PRODUCTION ? Environment.SANDBOX : Environment.PRODUCTION
  return [primary, secondary]
}

function ensureConfigured(): void {
  if (!isAppleIapConfigured()) {
    throw new AppleIapNotConfiguredError(
      "Apple IAP credentials are not set; refusing to trust any transaction data.",
    )
  }
}

/**
 * Run a verifier operation against each candidate environment in turn,
 * returning the first success. Only if EVERY environment rejects the data do we
 * throw — so forged or truly invalid data still fails closed, while a genuine
 * transaction signed in the non-primary environment is accepted.
 */
async function verifyAcrossEnvironments<T>(
  run: (verifier: SignedDataVerifier) => Promise<T>,
): Promise<T> {
  ensureConfigured()
  let lastError: unknown
  for (const environment of environmentAttemptOrder()) {
    try {
      return await run(buildVerifier(environment))
    } catch (error) {
      lastError = error
    }
  }
  throw new AppleIapVerificationError(
    `Verification failed in all environments: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
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
    revokedAt:
      typeof payload.revocationDate === "number"
        ? new Date(payload.revocationDate)
        : null,
    environment: payload.environment ? String(payload.environment) : null,
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
  return verifyAcrossEnvironments(async (verifier) => {
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
    return mapDecodedTransaction(decoded)
  })
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
  return verifyAcrossEnvironments(async (verifier) => {
    const notification = await verifier.verifyAndDecodeNotification(signedPayload)
    const signedTransactionInfo = notification.data?.signedTransactionInfo
    if (!signedTransactionInfo) {
      throw new AppleIapVerificationError(
        "Notification contained no signed transaction info to verify.",
      )
    }
    const decoded = await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
    return mapDecodedTransaction(decoded)
  })
}

/** True when the string is accepted by Node as an EC/PKCS#8 private key. */
function isParseablePrivateKey(pem: string): boolean {
  try {
    createPrivateKey(pem)
    return true
  } catch {
    return false
  }
}

/**
 * Normalize a `.p8` private key that may have been mangled by an environment
 * variable form. Env forms routinely strip the PEM header/footer, drop the
 * real newlines, keep only literal "\n" escapes, wrap the value in quotes, or
 * even store a base64 encoding of the whole PEM. Apple's library needs a real
 * PEM string, so we reconstruct one from whatever survived and validate it.
 *
 * Throws AppleIapNotConfiguredError (fail closed) when no valid key can be
 * derived — e.g. the stored value is truncated and bytes are genuinely missing.
 */
function tryNormalizeApplePrivateKey(raw: string): string | null {
  let value = raw.trim()
  if (!value) return null

  // Strip a single layer of surrounding quotes some forms add.
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }

  // Turn literal "\n" / "\r\n" escape sequences into real newlines.
  if (value.includes("\\n")) {
    value = value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").trim()
  }

  // Case 1: it is already a usable PEM.
  if (isParseablePrivateKey(value)) return value

  // Case 2: the entire PEM was base64-encoded into one line.
  if (!value.includes("BEGIN") && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
    try {
      const decoded = Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8")
      if (decoded.includes("BEGIN PRIVATE KEY") && isParseablePrivateKey(decoded)) {
        return decoded
      }
    } catch {
      // fall through to body reconstruction
    }
  }

  // Case 3: reconstruct a PKCS#8 PEM from the raw base64 body (headers and/or
  // newlines were lost by the form).
  const body = value.replace(/-----[^-]+-----/g, "").replace(/[^A-Za-z0-9+/=]/g, "")
  if (body) {
    const wrapped = `-----BEGIN PRIVATE KEY-----\n${body
      .replace(/(.{64})/g, "$1\n")
      .replace(/\n$/, "")}\n-----END PRIVATE KEY-----\n`
    if (isParseablePrivateKey(wrapped)) return wrapped
  }

  return null
}

/**
 * Concatenate the ordered `APPLE_IAP_PRIVATE_KEY_PART1..PARTn` values, if any.
 * Parts are joined with no separator; the normalizer strips whatever
 * whitespace/quotes each part carried. Returns "" when no parts are set.
 */
function readApplePrivateKeyParts(): string {
  const parts: string[] = []
  for (let i = 1; i <= 16; i++) {
    const value = process.env[`APPLE_IAP_PRIVATE_KEY_PART${i}`]
    if (!value?.trim()) break
    parts.push(value)
  }
  return parts.join("")
}

/**
 * Resolve a valid PEM private key from the environment, trying the single
 * `APPLE_IAP_PRIVATE_KEY` value first and then the multi-part
 * `APPLE_IAP_PRIVATE_KEY_PART1..n` form. Throws (fail closed) when neither
 * yields a parseable key — e.g. the stored value is genuinely truncated.
 */
function resolveApplePrivateKey(): string {
  const candidates = [process.env.APPLE_IAP_PRIVATE_KEY ?? "", readApplePrivateKeyParts()]
  for (const candidate of candidates) {
    const normalized = tryNormalizeApplePrivateKey(candidate)
    if (normalized) return normalized
  }
  throw new AppleIapNotConfiguredError(
    "APPLE_IAP_PRIVATE_KEY is set but is not a valid EC private key (it looks truncated or corrupted). " +
      "Re-enter the full .p8 contents, or split it across APPLE_IAP_PRIVATE_KEY_PART1, _PART2, … so no value is long enough to be truncated by the env form.",
  )
}

const apiClientCache = new Map<Environment, AppStoreServerAPIClient>()

function buildApiClient(environment: Environment): AppStoreServerAPIClient {
  const cached = apiClientCache.get(environment)
  if (cached) return cached

  const signingKey = resolveApplePrivateKey()
  const keyId = process.env.APPLE_IAP_KEY_ID!.trim()
  const issuerId = process.env.APPLE_IAP_ISSUER_ID!.trim()
  const bundleId = process.env.APPLE_IAP_BUNDLE_ID!.trim()

  const client = new AppStoreServerAPIClient(
    signingKey,
    keyId,
    issuerId,
    bundleId,
    environment,
  )
  apiClientCache.set(environment, client)
  return client
}

/**
 * Server-driven "Restore Purchases" for iOS.
 *
 * The SWING2APP module documents no client restore method, so we restore on the
 * server: given the original transaction id we recorded for the signed-in user
 * at purchase time, re-query Apple's App Store Server API for the CURRENT
 * subscription status, verify the signed transaction Apple returns, and return
 * the verified state. The caller re-grants only if Apple still reports an
 * active (or otherwise valid) subscription — a client claim is never trusted.
 *
 * Returns the verified transaction plus whether Apple considers it currently
 * entitled, or null if Apple has no record of it in either environment. Throws
 * (fail closed) when credentials are absent.
 */
export type RestoredAppleSubscription = {
  transaction: VerifiedAppleTransaction
  /** True when Apple's current status is ACTIVE or in a billing-grace period. */
  entitled: boolean
}

export async function restoreByOriginalTransactionId(
  originalTransactionId: string,
): Promise<RestoredAppleSubscription | null> {
  ensureConfigured()
  const id = originalTransactionId?.trim()
  if (!id) return null

  let lastError: unknown
  for (const environment of environmentAttemptOrder()) {
    try {
      const client = buildApiClient(environment)
      const response = await client.getAllSubscriptionStatuses(id)
      const verifier = buildVerifier(environment)

      // Prefer the entry that is currently active; otherwise fall back to any
      // last transaction so an expired/canceled result is reported truthfully.
      let bestActive: RestoredAppleSubscription | null = null
      let bestAny: RestoredAppleSubscription | null = null

      for (const group of response.data ?? []) {
        for (const last of group.lastTransactions ?? []) {
          const signed = last.signedTransactionInfo
          if (!signed) continue
          let decoded: JWSTransactionDecodedPayload
          try {
            decoded = await verifier.verifyAndDecodeTransaction(signed)
          } catch {
            // Signed by the other environment; let the outer loop retry there.
            continue
          }
          const transaction = mapDecodedTransaction(decoded)
          const entitled =
            last.status === Status.ACTIVE ||
            last.status === Status.BILLING_GRACE_PERIOD
          const candidate: RestoredAppleSubscription = { transaction, entitled }
          if (entitled && !bestActive) bestActive = candidate
          if (!bestAny) bestAny = candidate
        }
      }

      const result = bestActive ?? bestAny
      if (result) return result
      // No verifiable transaction in this environment; try the other.
    } catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw new AppleIapVerificationError(
      `Restore lookup failed: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    )
  }
  return null
}

/** Network failures, Apple 5xx, and 429 are retryable; nothing is granted or denied. */
function isTransientAppleError(error: unknown): boolean {
  if (error instanceof APIException) {
    return error.httpStatusCode === 429 || error.httpStatusCode >= 500
  }
  return error instanceof TypeError
}

function isNotFoundAppleError(error: unknown): boolean {
  return error instanceof APIException && error.httpStatusCode === 404
}

function looksLikeJws(value: string): boolean {
  return value.trim().split(".").length === 3
}

/**
 * Verifies the transaction the SWING2APP bridge returned after a native
 * purchase. Accepts either a StoreKit 2 JWS (`receipt`) or, when the bridge
 * only hands back a transaction id, looks that id up on Apple's App Store
 * Server API and verifies the Apple-signed response. Either way the returned
 * data is Apple-signed and verified; client fields are never trusted.
 */
export async function verifyNativePurchase(input: {
  receipt: string
  transactionId: string | null
}): Promise<AppleTransaction> {
  ensureConfigured()
  const receipt = input.receipt?.trim() ?? ""
  const transactionId = input.transactionId?.trim() || null

  if (receipt && looksLikeJws(receipt)) {
    try {
      return await verifySignedTransaction(receipt)
    } catch (error) {
      if (!transactionId) throw error
    }
  }
  if (!transactionId) {
    throw new AppleIapVerificationError("No verifiable transaction data.")
  }

  let transient: unknown = null
  for (const environment of environmentAttemptOrder()) {
    try {
      const response = await buildApiClient(environment).getTransactionInfo(
        transactionId,
      )
      if (!response.signedTransactionInfo) continue
      const decoded = await buildVerifier(environment).verifyAndDecodeTransaction(
        response.signedTransactionInfo,
      )
      return mapDecodedTransaction(decoded)
    } catch (error) {
      if (error instanceof AppleIapNotConfiguredError) throw error
      if (isTransientAppleError(error)) transient = error
    }
  }
  if (transient) {
    throw new AppleIapTransientError(
      `Apple transaction lookup unavailable: ${(transient as Error).message}`,
    )
  }
  throw new AppleIapVerificationError("Apple has no verifiable record of this transaction.")
}

/**
 * Apple's CURRENT, verified state for a subscription: entitlement (ACTIVE or
 * BILLING_GRACE_PERIOD), auto-renew on/off, grace end, and the latest
 * transaction (renewals included). Null when Apple has no record in either
 * environment. Throws AppleIapTransientError when Apple can't be reached so the
 * caller reports "pending" instead of a false "expired"/"canceled".
 */
export async function getAppleSubscriptionState(
  originalTransactionId: string,
): Promise<AppleSubscriptionState | null> {
  ensureConfigured()
  const id = originalTransactionId?.trim()
  if (!id) return null

  let transient: unknown = null
  let failure: unknown = null
  for (const environment of environmentAttemptOrder()) {
    try {
      const response = await buildApiClient(environment).getAllSubscriptionStatuses(id)
      const verifier = buildVerifier(environment)
      let bestActive: AppleSubscriptionState | null = null
      let bestAny: AppleSubscriptionState | null = null

      for (const group of response.data ?? []) {
        for (const last of group.lastTransactions ?? []) {
          if (!last.signedTransactionInfo) continue
          let transaction: AppleTransaction
          try {
            transaction = mapDecodedTransaction(
              await verifier.verifyAndDecodeTransaction(last.signedTransactionInfo),
            )
          } catch {
            continue
          }
          let autoRenew: boolean | null = null
          let graceExpiresAt: Date | null = null
          if (last.signedRenewalInfo) {
            try {
              const renewal = await verifier.verifyAndDecodeRenewalInfo(
                last.signedRenewalInfo,
              )
              if (typeof renewal.autoRenewStatus === "number") {
                autoRenew = renewal.autoRenewStatus === 1
              }
              if (typeof renewal.gracePeriodExpiresDate === "number") {
                graceExpiresAt = new Date(renewal.gracePeriodExpiresDate)
              }
            } catch {
              // Renewal info is advisory; entitlement comes from the status.
            }
          }
          const entitled =
            last.status === Status.ACTIVE ||
            last.status === Status.BILLING_GRACE_PERIOD
          const candidate = { entitled, autoRenew, graceExpiresAt, transaction }
          if (entitled && !bestActive) bestActive = candidate
          if (!bestAny) bestAny = candidate
        }
      }
      const result = bestActive ?? bestAny
      if (result) return result
    } catch (error) {
      if (error instanceof AppleIapNotConfiguredError) throw error
      if (isNotFoundAppleError(error)) continue
      if (isTransientAppleError(error)) transient = error
      else failure = error
    }
  }
  if (transient) {
    throw new AppleIapTransientError(
      `Apple subscription status unavailable: ${(transient as Error).message}`,
    )
  }
  if (failure) {
    throw new AppleIapVerificationError(
      `Apple subscription status lookup failed: ${(failure as Error).message}`,
    )
  }
  return null
}
