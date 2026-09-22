// Runtime platform detection.
//
// This is HONEST environment detection, not the old `?platform=ios` URL flag
// that Apple rejected under Guideline 5.6 (functionality hidden from review).
// `detectPlatform()` reports "ios" only inside the genuine native iOS app
// WebView (WKWebView) — read from the same message-handler marker the SWING
// library's own platform check uses — and "web" in every ordinary browser,
// including mobile Safari.
//
// It is used for ONE purpose: to route digital purchases through Apple In-App
// Purchase and withhold external card/Stripe purchase surfaces inside the app,
// as Guideline 3.1.1 requires. It is NEVER used to hide a feature, plan, book,
// or piece of content — the in-app IAP path to acquire everything (Premium
// unlocks the full library) stays fully present, so App Review sees the same
// app, just with the App Store as the payment rail.

import { isIosNativeApp } from "@/lib/apple/swing-bridge"

export type Platform = "web" | "ios" | "android"

export function detectPlatform(): Platform {
  return isIosNativeApp() ? "ios" : "web"
}

export function isIOSApp(platform: Platform): boolean {
  return platform === "ios"
}

export function isNativeApp(platform: Platform): boolean {
  return platform === "ios" || platform === "android"
}
