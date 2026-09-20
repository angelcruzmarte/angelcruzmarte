/**
 * Client-side bridge to the SWING2APP native In-App Purchase module.
 *
 * SWING2APP installs a native StoreKit module into the iOS WebView build and
 * exposes it to page JavaScript as `window.swingWebViewPlugin.app.inapp` with
 * three methods (per the SWING2APP iOS IAP guide):
 *   - buy(productId, cb)         one-time products (consumable / non-consumable)
 *   - subscribe(productId, cb)   auto-renewable / non-renewing subscriptions
 *   - isSubscribed(productId, cb) native active-subscription status query
 *
 * The purchase callbacks receive `(responseCode, data)`. The guide's examples
 * treat `responseCode === 1` as success and `data` as a JSON string containing
 * `receipt`, `productId`, and `transaction.transactionIdentifier`.
 *
 * IMPORTANT — this module does NOT grant anything. A successful native callback
 * is only the START of verification: the caller must POST the returned values
 * to our authenticated backend (`/api/apple/purchase`), which verifies the
 * transaction with Apple before any entitlement is written. On the web (no
 * native module) `isSwingIapAvailable()` returns false and callers fall back to
 * the existing Stripe flow. Nothing is hidden — only the payment rail differs.
 */

type SwingPurchaseCallback = (responseCode: number, data: string) => void

interface SwingInApp {
  buy(productId: string, cb: SwingPurchaseCallback): void
  subscribe(productId: string, cb: SwingPurchaseCallback): void
  isSubscribed(productId: string, cb: (value: boolean) => void): void
}

interface SwingWebViewPlugin {
  app?: { inapp?: SwingInApp }
}

declare global {
  interface Window {
    swingWebViewPlugin?: SwingWebViewPlugin
  }
}

/** Normalized, still-UNVERIFIED result of a native purchase callback. */
export type AppleNativePurchase = {
  /** Purchase receipt returned by the module. Sensitive verification data. */
  receipt: string
  /** Apple product id reported by the module. */
  productId: string
  /** This transaction's identifier, or null if the module omitted it. */
  transactionId: string | null
}

/** A failed or non-successful native purchase callback. */
export class AppleNativePurchaseError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.name = "AppleNativePurchaseError"
    this.code = code
  }
}

function getInApp(): SwingInApp | null {
  if (typeof window === "undefined") return null
  return window.swingWebViewPlugin?.app?.inapp ?? null
}

/**
 * True only when the SWING2APP native IAP module is present (i.e. we are inside
 * the module-enabled iOS app). Detected at runtime from the injected bridge
 * object, NOT from a URL flag — so the web build is never affected and no UI is
 * conditionally hidden from review.
 */
export function isSwingIapAvailable(): boolean {
  const inapp = getInApp()
  return Boolean(inapp && typeof inapp.subscribe === "function")
}

/**
 * The SWING2APP common JavaScript library. Per the iOS IAP guide, this script
 * MUST be loaded on any page that calls the bridge — it is what defines
 * `window.swingWebViewPlugin`. Inside the module-enabled iOS app it wires up to
 * the native StoreKit module; in a plain browser it loads harmlessly and never
 * exposes a payment module (so the web build keeps using Stripe). The version
 * pinned here is the one published in the guide.
 */
const SWING_LIBRARY_SRC =
  "https://pcdn2.swing2app.co.kr/swing_public_src/v3/2026_02_04_001/js/swing_app_on_web.js"

let libraryRequested = false

/**
 * Inject the SWING2APP library once (client only). Safe to call repeatedly and
 * from multiple components; the script is added at most once per document.
 */
export function ensureSwingLibrary(): void {
  if (typeof document === "undefined") return
  // Already present (bridge injected or script tag added by a prior call).
  if (isSwingIapAvailable()) return
  if (libraryRequested || document.querySelector("script[data-swing-iap]")) {
    libraryRequested = true
    return
  }
  libraryRequested = true
  const script = document.createElement("script")
  script.src = SWING_LIBRARY_SRC
  script.async = true
  script.setAttribute("data-swing-iap", "")
  document.head.appendChild(script)
}

/**
 * Resolve once the native IAP bridge is available, or false after `timeoutMs`.
 *
 * The native module injects `window.swingWebViewPlugin` asynchronously (after
 * the library loads / the WebView wires it up), so a single synchronous check
 * at mount races that injection and wrongly falls back to Stripe. This ensures
 * the library is loaded, then polls until the bridge appears or the timeout
 * elapses. On the web the bridge never appears and this resolves false, so the
 * Stripe path runs — nothing is hidden, only the payment rail differs.
 */
export function waitForSwingIap(timeoutMs = 4000, intervalMs = 150): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (isSwingIapAvailable()) return Promise.resolve(true)
  ensureSwingLibrary()
  return new Promise((resolve) => {
    const start = Date.now()
    const timer = setInterval(() => {
      if (isSwingIapAvailable()) {
        clearInterval(timer)
        resolve(true)
      } else if (Date.now() - start >= timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, intervalMs)
  })
}

// Builds the shared success/failure parser used by buy() and subscribe(). The
// guide notes the callback contract is under-specified (responseCode 1 appears
// as both "success" in the examples and "payment error" in the error list), so
// we follow the worked examples (1 === success) and treat everything else as a
// non-success that must NOT grant access. Malformed/partial payloads are also
// rejected rather than trusted.
function makeCallback(
  resolve: (p: AppleNativePurchase) => void,
  reject: (e: AppleNativePurchaseError) => void,
): SwingPurchaseCallback {
  return (responseCode, data) => {
    if (responseCode !== 1) {
      reject(
        new AppleNativePurchaseError(
          responseCode,
          typeof data === "string" && data
            ? data
            : "The purchase did not complete.",
        ),
      )
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      reject(new AppleNativePurchaseError(responseCode, "Malformed purchase response."))
      return
    }
    const record = (parsed ?? {}) as {
      receipt?: unknown
      productId?: unknown
      transaction?: { transactionIdentifier?: unknown } | null
    }
    const receipt = typeof record.receipt === "string" ? record.receipt : ""
    const productId = typeof record.productId === "string" ? record.productId : ""
    const transactionId =
      record.transaction && typeof record.transaction.transactionIdentifier === "string"
        ? record.transaction.transactionIdentifier
        : null
    if (!receipt || !productId) {
      reject(
        new AppleNativePurchaseError(responseCode, "Incomplete purchase response."),
      )
      return
    }
    resolve({ receipt, productId, transactionId })
  }
}

/** Starts a native subscription purchase for the given Apple product id. */
export function subscribeViaApple(productId: string): Promise<AppleNativePurchase> {
  return new Promise((resolve, reject) => {
    const inapp = getInApp()
    if (!inapp?.subscribe) {
      reject(new AppleNativePurchaseError(-1, "In-app purchases are not available."))
      return
    }
    inapp.subscribe(productId, makeCallback(resolve, reject))
  })
}

/** Starts a native one-time purchase (e.g. a book) for the given product id. */
export function buyViaApple(productId: string): Promise<AppleNativePurchase> {
  return new Promise((resolve, reject) => {
    const inapp = getInApp()
    if (!inapp?.buy) {
      reject(new AppleNativePurchaseError(-1, "In-app purchases are not available."))
      return
    }
    inapp.buy(productId, makeCallback(resolve, reject))
  })
}

/**
 * Native active-subscription status for a product id. This is only a hint for
 * the UI — the guide is explicit that it is NOT a full subscription record and
 * must never, on its own, erase a valid entitlement from another source. Server
 * state remains the source of truth. Resolves false when unavailable.
 */
export function isSubscribedNative(productId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const inapp = getInApp()
    if (!inapp?.isSubscribed) {
      resolve(false)
      return
    }
    try {
      inapp.isSubscribed(productId, (value) => resolve(Boolean(value)))
    } catch {
      resolve(false)
    }
  })
}
