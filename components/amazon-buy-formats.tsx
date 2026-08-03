"use client"

import { useState } from "react"
import {
  BookOpen,
  ChevronDown,
  ExternalLink,
  Headphones,
  ShoppingCart,
} from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { trackAffiliateClick } from "@/lib/affiliate-track"
import {
  browserAmazonLink,
  type AmazonFormatId,
  type AmazonFormatLink,
} from "@/lib/affiliate"

const FORMAT_ICON: Record<AmazonFormatId, typeof BookOpen> = {
  kindle: BookOpen,
  audible: Headphones,
  print: ShoppingCart,
}

/** Short caption describing exactly what a link does, to stay accurate. */
function formatHint(f: AmazonFormatLink): string {
  if (f.id === "kindle") {
    return f.exact ? "Read instantly on any device" : "Opens the Kindle Store on Amazon"
  }
  if (f.id === "audible") {
    return f.exact ? "Listen on Audible" : "Search Audible on Amazon"
  }
  return f.exact ? "Ships from Amazon" : "See paperback & hardcover on Amazon"
}

/**
 * Primary Amazon purchase action for affiliate titles, digital-first. The
 * primary button always targets the Kindle edition (exact product when known,
 * otherwise the Kindle Store scoped to this title). Other formats — Audible and
 * print — are tucked behind a "View other formats" toggle so the default path
 * stays simple and fast. Every outbound link is tagged (built server-side),
 * marked rel="sponsored nofollow", and fires a best-effort click beacon.
 */
export function AmazonBuyFormats({
  formats,
  bookId,
  title,
  author,
}: {
  formats: AmazonFormatLink[]
  bookId?: number | null
  title?: string
  author?: string | null
}) {
  const [open, setOpen] = useState(false)
  if (formats.length === 0) return null

  const [primary, ...others] = formats
  // "Buy Kindle eBook" when we can link the exact product; "Shop Kindle
  // edition" when it is a Kindle-Store search (we can't assert it exists).
  const primaryLabel = primary.exact
    ? `Buy ${primary.label}`
    : "Shop Kindle edition"

  const track = () => trackAffiliateClick({ bookId, title, author })

  return (
    <div className="flex flex-col gap-2">
      <a
        href={browserAmazonLink(primary.url)}
        target="_blank"
        rel="noopener noreferrer sponsored nofollow"
        onClick={track}
        className={cn(
          buttonVariants({ size: "lg" }),
          "w-full gap-2 sm:w-auto",
        )}
      >
        <ShoppingCart className="h-4 w-4" />
        {primaryLabel}
      </a>

      {/* Format pill: always tells the user what the primary action buys. */}
      <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
          <BookOpen className="h-3 w-3" />
          {primary.label}
        </span>
        <span>{formatHint(primary)}</span>
      </div>

      {others.length > 0 && (
        <div className="px-1">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
            {open ? "Hide other formats" : "View other formats"}
          </button>

          {open && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {others.map((f) => {
                const Icon = FORMAT_ICON[f.id]
                return (
                  <li key={f.id}>
                    <a
                      href={browserAmazonLink(f.url)}
                      target="_blank"
                      rel="noopener noreferrer sponsored nofollow"
                      onClick={track}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/50 hover:bg-accent"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">
                          {f.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatHint(f)}
                        </span>
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
