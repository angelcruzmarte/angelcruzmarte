"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { trackAffiliateClick } from "@/lib/affiliate-track"

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
  return (
    <Button
      size="lg"
      variant={primary ? "default" : "outline"}
      className={"gap-2 " + (className ?? "")}
      render={
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer sponsored nofollow"
          onClick={() => trackAffiliateClick({ bookId, title, author })}
        />
      }
    >
      <ShoppingCart className="h-4 w-4" />
      {label}
    </Button>
  )
}
