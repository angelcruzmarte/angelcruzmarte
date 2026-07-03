"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Headphones, Loader2, ShoppingCart } from "lucide-react"
import { createBookCheckout } from "@/app/actions/books"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/plans"

/**
 * Renders either a "Buy" button (one-time Stripe Checkout) or, if the user
 * already owns the book, a "Listen" button that opens the book player.
 */
export function BuyBookButton({
  bookId,
  priceInCents,
  owned,
  className,
}: {
  bookId: number
  priceInCents: number
  owned: boolean
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function handleBuy() {
    startTransition(async () => {
      const res = await createBookCheckout(bookId)
      if (res.url) {
        window.location.href = res.url
      }
    })
  }

  if (owned) {
    return (
      <Button
        size="lg"
        className={className}
        onClick={() => router.push(`/app/listen/book/${bookId}`)}
      >
        <Headphones className="h-4 w-4" />
        Listen now
      </Button>
    )
  }

  return (
    <Button
      size="lg"
      className={className}
      onClick={handleBuy}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ShoppingCart className="h-4 w-4" />
      )}
      Buy for {formatPrice(priceInCents)}
    </Button>
  )
}
