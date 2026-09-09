// Platform detection is intentionally neutralized: VOXYFI now behaves IDENTICALLY
// on web, iOS, and Android.
//
// Previously the native iOS wrapper loaded the site with `?platform=ios` and the
// web app hid all purchase UI (prices, subscribe/trial CTAs, buy buttons, cart,
// billing portal) to satisfy Apple Guideline 3.1.1. Apple rejected that approach
// under Guideline 5.6 because functionality was being hidden from review — the
// app behaved differently inside the reviewed build than on the web. To resolve
// that, we no longer detect or special-case any native wrapper: `detectPlatform`
// always reports "web", so every consumer renders the exact same experience for
// all users regardless of how the app is launched.
//
// The type and helper signatures are preserved so existing callers keep
// compiling; they simply never take a native-only branch anymore.

export type Platform = "web" | "ios" | "android"

// Always reports "web". The app presents the same functionality everywhere, so
// there is no platform-conditional behavior and nothing is hidden from review.
export function detectPlatform(): Platform {
  return "web"
}

// Retained for API compatibility. Always false now that the app does not
// special-case the iOS wrapper.
export function isIOSApp(_platform: Platform): boolean {
  return false
}

// Retained for API compatibility. Always false now that the app does not
// special-case any native wrapper.
export function isNativeApp(_platform: Platform): boolean {
  return false
}
