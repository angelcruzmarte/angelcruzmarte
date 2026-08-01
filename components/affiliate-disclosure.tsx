import Link from "next/link"
import { Info } from "lucide-react"

import { affiliateDisclosure } from "@/lib/affiliate"
import { cn } from "@/lib/utils"

/**
 * Amazon Associates / FTC disclosure primitives.
 *
 * `AffiliateDisclosure` renders Amazon's EXACT mandated statement
 * ("As an Amazon Associate I earn from qualifying purchases.") clearly and
 * conspicuously, with a link to the full disclosure page. Use it anywhere a
 * "Buy on Amazon" affiliate link appears.
 *
 * `AffiliateBuyNote` is the compact, link-level FTC marker placed directly
 * beneath a buy button so the paid nature of the link is disclosed *before*
 * the user clicks it.
 */
export function AffiliateDisclosure({
  className,
  withLink = true,
}: {
  className?: string
  withLink?: boolean
}) {
  return (
    <p
      className={cn(
        "text-xs leading-relaxed text-muted-foreground",
        className,
      )}
    >
      {affiliateDisclosure()}
      {withLink && (
        <>
          {" "}
          <Link
            href="/legal/affiliate-disclosure"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Learn more
          </Link>
        </>
      )}
    </p>
  )
}

/**
 * Compact link-level disclosure for placement directly under a "Buy on Amazon"
 * button. Makes the paid-link nature and off-site (Amazon) checkout explicit
 * before the click, satisfying the FTC "clear and conspicuous, near the link"
 * requirement.
 */
export function AffiliateBuyNote({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[11px] leading-tight text-muted-foreground",
        className,
      )}
    >
      <Info className="h-3 w-3 shrink-0" aria-hidden />
      Paid affiliate link — you complete your purchase on Amazon.
    </span>
  )
}
