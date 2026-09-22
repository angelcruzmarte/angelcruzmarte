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
 * True ONLY inside the SWING2APP-generated native app WebView (iOS WKWebView or
 * Android), false in every ordinary browser — including mobile Safari.
 *
 * These markers are injected by the native app shell itself, NOT by the swing
 * JS library, so they distinguish "inside the app" from "plain web" *before*
 * and *independently of* loading the library. This mirrors the exact test the
 * library's own `getCurrentPlatform()` uses:
 *   - Android: `window.SwingJavascriptInterface` is defined
 *   - iOS:     the WKWebView message handler `observe` is present
 *
 * This check is the crux of the web-vs-app split. The swing "on web" library
 * defines `window.swingWebViewPlugin.app.inapp.subscribe` as a function on
 * EVERY platform, but on plain web that function silently no-ops (it only calls
 * StoreKit when the platform is ios/android) and NEVER invokes its callback.
 * So "is subscribe a function" is a false positive on the web that would route
 * the browser into a native purchase which hangs forever. We must confirm the
 * real native WebView instead.
 */
function isNativeAppWebView(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as {
    SwingJavascriptInterface?: unknown
    webkit?: { messageHandlers?: { observe?: unknown } }
  }
  if (typeof w.SwingJavascriptInterface !== "undefined") return true
  if (w.webkit?.messageHandlers?.observe != null) return true
  return false
}

/**
 * True ONLY inside the genuine native iOS app WebView (WKWebView), false in
 * every browser (including mobile Safari) and in the Android app. It reads the
 * same WKWebView message-handler marker the SWING library's own platform check
 * uses, so it reports the real runtime environment.
 *
 * This is NOT the old `?platform=ios` URL flag (which Apple rejected under
 * Guideline 5.6 for hiding whole features from review). It exists solely so the
 * iOS build can withhold EXTERNAL purchase links for DIGITAL books
 * (Kindle/Audible) to satisfy Guideline 3.1.1, while the website keeps its full
 * Amazon affiliate experience. It must never be used to hide unrelated
 * functionality — only to restrict digital-purchase payment links.
 */
export function isIosNativeApp(): boolean {
  if (typeof window === "undefined") return false
  const w = window as unknown as {
    webkit?: { messageHandlers?: { observe?: unknown } }
  }
  return w.webkit?.messageHandlers?.observe != null
}

/**
 * True only when we are inside the native app WebView AND the native IAP bridge
 * is wired up. On the web this is always false, so callers fall back to Stripe.
 * Detection is runtime capability + native-environment based, NOT a URL flag —
 * the same plans/prices/buttons render either way; only the payment rail
 * differs, so nothing is hidden from App Review.
 */
export function isSwingIapAvailable(): boolean {
  if (!isNativeAppWebView()) return false
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
  // Only load the native bridge library inside the app WebView. On the plain
  // web the library is unnecessary (checkout uses Stripe) AND has side effects
  // — it injects `window.swingWebViewPlugin` stubs (whose IAP methods no-op and
  // never call back) plus an app-promotion dialog — so we never inject it in a
  // browser. This is also what keeps web detection from ever turning true.
  if (!isNativeAppWebView()) return
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
  // Not inside the native app → this is a plain browser → checkout uses Stripe.
  // Resolve immediately (no polling, no library injection) so the web subscribe
  // button never stalls waiting for a native bridge that will never appear.
  if (!isNativeAppWebView()) return Promise.resolve(false)
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

/**
 * Human-readable explanation of a native purchase failure, mapped from the
 * error codes documented in the SWING2APP iOS IAP guide (page 5). The guide
 * warns this list is NOT authoritative ("do not build a definitive code map
 * from this list"), so we always append the raw code — that lets a failing
 * TestFlight purchase be diagnosed from a screenshot instead of guessed at, and
 * unknown codes fall back to a generic message. This only describes a failure;
 * it never grants access.
 *
 * Note on code 5 ("product unavailable in the current storefront"): StoreKit
 * does not return a product whose App Store Connect metadata is incomplete
 * ("Prepare for Submission") or whose first auto-renewable subscription has not
 * yet been submitted with an app version — so a not-yet-finished product
 * surfaces here even in Sandbox.
 */
export function describeApplePurchaseError(err: AppleNativePurchaseError): string {
  const base = (() => {
    switch (err.code) {
      case 0:
        return "Something went wrong with the App Store. Please try again."
      case 1:
        return "This Apple Account isn't allowed to make this purchase."
      case 2:
        return "The purchase was canceled."
      case 3:
        // StoreKit SKErrorPaymentInvalid (raw value 3): "one or more of the
        // payment parameters wasn't recognized by the App Store." In practice
        // this fires when the specific product isn't purchasable yet — its App
        // Store Connect metadata/pricing is incomplete or it hasn't been
        // cleared for sale in this storefront — OR the Apple Account's payment
        // method is invalid. Name both honestly rather than blaming only the
        // card.
        return "The App Store couldn't process this purchase. The subscription may not be fully set up for sale yet (App Store Connect), or the payment method on this Apple Account may be invalid (check Settings › Media & Purchases). Try again once both are in order."
      case 4:
        return "This Apple Account isn't allowed to authorize payments. Purchases may be restricted (for example by Screen Time or a managed/family account)."
      case 5:
        return "This subscription isn't available from the App Store yet. It may still be pending setup or review in App Store Connect."
      case 6:
        return "Access to your Apple Account information was denied."
      case 7:
        return "Couldn't reach the App Store. Check your connection and try again."
      case 8:
        return "Apple Account permission was revoked."
      case -1:
        return "In-app purchases aren't available in this app."
      default:
        return "The purchase didn't complete."
    }
  })()
  return `${base} (code ${err.code}) Your access is unchanged.`
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
