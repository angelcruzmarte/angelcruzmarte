"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { bookshopBuyUrl } from "@/lib/book-stores"

/**
 * "Buy on Bookshop.org" — like Speechify, the app is connected to one bookstore
 * (Bookshop.org, which carries essentially every book) so the user can buy any
 * book without picking a retailer. For commercial (affiliate) titles this is
 * the PRIMARY purchase action and deep-links to the exact edition by ISBN
 * (affiliate-tagged when an affiliate id is configured). For public-domain
 * titles it stays a secondary "buy a physical copy" convenience.
 */
export function BuyElsewhereButton({
  title,
  author,
  isbn,
  buyUrl,
  primary = false,
  label,
  className,
}: {
  title: string
  author?: string | null
  isbn?: string | null
  buyUrl?: string | null
  /** Render as the filled primary action (used for affiliate titles). */
  primary?: boolean
  /** Override the button label. */
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
          href={bookshopBuyUrl({ title, author, isbn, buyUrl })}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <ShoppingCart className="h-4 w-4" />
      {label ?? (primary ? "Buy on Bookshop.org" : "Buy this book")}
    </Button>
  )
}
