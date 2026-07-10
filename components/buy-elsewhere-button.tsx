"use client"

import { ShoppingCart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { bookstoreUrl } from "@/lib/book-stores"

/**
 * Single-tap "Buy" — like Speechify, the app is connected to one bookstore
 * (Bookshop.org, which carries essentially every book) so the user can buy
 * any book without having to pick a retailer. Opens a pre-filled search for
 * the book's title + author.
 */
export function BuyElsewhereButton({
  title,
  author,
  className,
}: {
  title: string
  author?: string | null
  className?: string
}) {
  return (
    <Button
      size="lg"
      variant="outline"
      className={"gap-2 " + (className ?? "")}
      render={
        <a
          href={bookstoreUrl(title, author)}
          target="_blank"
          rel="noopener noreferrer"
        />
      }
    >
      <ShoppingCart className="h-4 w-4" />
      Buy this book
    </Button>
  )
}
