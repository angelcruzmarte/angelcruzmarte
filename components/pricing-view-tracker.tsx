"use client"

import { useEffect } from "react"
import { trackPricingView } from "@/app/actions/funnel"

/**
 * Fires a single pricing-view log on mount. Anonymous, cookie-based, and
 * best-effort — never blocks or breaks the page.
 */
export function PricingViewTracker({ path = "pricing" }: { path?: string }) {
  useEffect(() => {
    const referrer = typeof document !== "undefined" ? document.referrer : ""
    void trackPricingView(path, referrer || undefined)
  }, [path])
  return null
}
