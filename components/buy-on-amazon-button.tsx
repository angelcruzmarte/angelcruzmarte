"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * "Buy on Amazon" — the primary purchase action for affiliate (non-native)
 * titles. The affiliate URL is built on the server (single source of truth for
 * the Associate tag) and passed in as `href`. On click we fire a best-effort
 * tracking beacon to /api/store/affiliate-click before the browser follows the
 * link, so the admin dashboard can measure click-outs.
 */
export function BuyOnAmazonButton({
  href,
  bookId,
  title,
  author,
  primary = true,
  label = "Buy on Amazon",
  className,
}: {
  href: string
  bookId?: number | null
  title?: string
  author?: string | null
  primary?: boolean
  label?: string
  className?: string
}) {
  function trackClick() {
    try {
      const payload = JSON.stringify({ bookId, title, author })
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/store/affiliate-click",
          new Blob([payload], { type: "application/json" }),
        )
      } else {
        void fetch("/api/store/affiliate-click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        })
      }
    } catch {
      // Never block the buy on a tracking failure.
    }
  }

  return (
    <Button
      size="lg"
      variant={primary ? "default" : "outline"}
      className={"gap-2 " + (className ?? "")}
      render={
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored"
          onClick={trackClick}
        />
      }
    >
      <ShoppingCart className="h-4 w-4" />
      {label}
    </Button>
  )
}
