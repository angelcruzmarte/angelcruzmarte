// Native-wrapper detection for App Store / Play Store compliance.
//
// VOXYFI ships to the Apple App Store and Google Play as a native wrapper
// (PWABuilder / Capacitor) around the web app. Apple Guideline 3.1.1 forbids
// selling digital subscriptions through anything other than Apple's in-app
// purchase inside an iOS app, so the wrapped iOS build must NOT show the Stripe
// paywall. To tell the web app it is running inside a native shell, the native
// project loads the site with a `?platform=ios` (or `android`) query parameter.
// We persist that flag to localStorage on first load so it survives client-side
// navigation and app restarts.
//
// On the plain web (no flag) everything behaves exactly as before, so existing
// users and the browser experience are completely unaffected.

const STORAGE_KEY = "voxyfi:platform"

export type Platform = "web" | "ios" | "android"

// Read the persisted/URL platform flag. Safe to call on the server (returns
// "web") and in the browser.
export function detectPlatform(): Platform {
  if (typeof window === "undefined") return "web"

  try {
    const param = new URLSearchParams(window.location.search)
      .get("platform")
      ?.toLowerCase()
    if (param === "ios" || param === "android") {
      window.localStorage.setItem(STORAGE_KEY, param)
      return param
    }

    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === "ios" || stored === "android") return stored
  } catch {
    // localStorage can throw in private mode / sandboxed webviews; fall through.
  }

  return "web"
}

// True when running inside the native iOS shell, where Apple requires that no
// external (non-IAP) purchase flow is shown.
export function isIOSApp(platform: Platform): boolean {
  return platform === "ios"
}

// True inside any native wrapper (iOS or Android).
export function isNativeApp(platform: Platform): boolean {
  return platform === "ios" || platform === "android"
}
