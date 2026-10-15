/**
 * Apple IAP error types. Kept free of `server-only` and Apple SDK imports so the
 * entitlement orchestrator (lib/apple/process-purchase.ts) can be unit-tested.
 */

/** Thrown whenever Apple verification cannot be performed. Callers fail closed. */
export class AppleIapNotConfiguredError extends Error {
  constructor(message = "Apple IAP verification is not configured") {
    super(message)
    this.name = "AppleIapNotConfiguredError"
  }
}

/** Signed data is missing, malformed, or failed cryptographic / Apple verification. */
export class AppleIapVerificationError extends Error {
  constructor(message = "Apple IAP signed data failed verification") {
    super(message)
    this.name = "AppleIapVerificationError"
  }
}

/**
 * Apple could not be reached or returned a retryable error (network, 5xx, 429).
 * The purchase is neither granted nor rejected — it is reported as pending.
 */
export class AppleIapTransientError extends Error {
  constructor(message = "Apple verification is temporarily unavailable") {
    super(message)
    this.name = "AppleIapTransientError"
  }
}
