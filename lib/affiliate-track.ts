/**
 * Client-side affiliate click tracking. Fires a best-effort beacon to
 * /api/store/affiliate-click so the admin dashboard can measure click-outs.
 * Uses navigator.sendBeacon so the request survives the ensuing navigation
 * (the "record the click before redirecting" guarantee); falls back to a
 * keepalive fetch. Never throws — tracking must never block a purchase.
 */
export function trackAffiliateClick(payload: {
  bookId?: number | null
  title?: string | null
  author?: string | null
}): void {
  try {
    const body = JSON.stringify(payload)
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/store/affiliate-click",
        new Blob([body], { type: "application/json" }),
      )
    } else {
      void fetch("/api/store/affiliate-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
    }
  } catch {
    // Best-effort only.
  }
}
