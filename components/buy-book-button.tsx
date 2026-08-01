"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Headphones, Loader2, Plus, ShoppingCart } from "lucide-react"
import { createBookCheckout } from "@/app/actions/books"
import { useCart, type CartItem } from "@/components/cart-provider"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/plans"

/**
 * Book detail actions: "Listen now" when owned, otherwise "Buy now" (one-tap
 * Stripe Checkout) plus an "Add to cart" button for multi-book purchases.
 */
export function BuyBookButton({
  bookId,
  priceInCents,
  owned,
  cartItem,
  className,
}: {
  bookId: number
  priceInCents: number
  owned: boolean
  /** Minimal book info used to add this book to the cart. */
  cartItem?: CartItem
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { has, add, setOpen } = useCart()
  const inCart = has(bookId)

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
    <div className={"flex flex-col gap-2 sm:flex-row " + (className ?? "")}>
      <Button size="lg" className="gap-2" onClick={handleBuy} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShoppingCart className="h-4 w-4" />
        )}
        Buy for {formatPrice(priceInCents)}
      </Button>
      {cartItem &&
        (inCart ? (
          <Button
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={() => setOpen(true)}
          >
            <Check className="h-4 w-4" />
            In cart · View
          </Button>
        ) : (
          <Button
            size="lg"
            variant="outline"
            className="gap-2"
            onClick={() => add(cartItem)}
          >
            <Plus className="h-4 w-4" />
            Add to cart
          </Button>
        ))}
    </div>
  )
}
