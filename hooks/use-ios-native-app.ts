"use client"

import { useEffect, useState } from "react"
import { isIosNativeApp } from "@/lib/apple/swing-bridge"

/**
 * Client hook: true only inside the genuine native iOS app WebView (WKWebView).
 *
 * Starts `false` on the server and on the first client render so SSR and
 * hydration match, then flips to `true` after mount when the native WKWebView
 * markers are present. Consumers use it to withhold EXTERNAL purchase links for
 * DIGITAL books (Kindle/Audible) inside the iOS build per App Store Guideline
 * 3.1.1. This is a narrow payment-link restriction — NOT the old
 * `?platform=ios` feature-hiding — so it must never gate non-purchase UI.
 */
export function useIsIosNativeApp(): boolean {
  const [ios, setIos] = useState(false)
  useEffect(() => {
    setIos(isIosNativeApp())
  }, [])
  return ios
}
