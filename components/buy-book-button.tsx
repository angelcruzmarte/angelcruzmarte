"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Crown, Headphones, Loader2, Plus, ShoppingCart } from "lucide-react"
import { createBookCheckout } from "@/app/actions/books"
import { useCart, useCartUI, type CartItem } from "@/components/cart-provider"
import { isSwingIapAvailable } from "@/lib/apple/swing-bridge"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/plans"

/**
 * Book detail actions.
 *
 * Access to a book's full text/audio is granted by EITHER owning the book
 * (a one-time purchase) OR an active Premium subscription — Premium is
 * "Unlimited access to the full library", so a subscriber can open any book
 * without buying it individually.
 *
 * Payment rail by platform (Apple Guideline 3.1.1):
 *  - Inside the iOS app (SWING2APP native IAP module present) we must NOT run an
 *    external card/Stripe checkout for digital goods. Books are acquired by
 *    subscribing to Premium via Apple In-App Purchase, so the buy action routes
 *    to the Premium paywall (which runs the native StoreKit sheet). This is a
 *    payment-rail switch, not hidden functionality — the book is still fully
 *    acquirable in-app.
 *  - On the web (and any non-module build) the existing Stripe one-time
 *    purchase + cart flow renders unchanged.
 */
export function BuyBookButton({
  bookId,
  priceInCents,
  owned,
  subscribed = false,
  cartItem,
  className,
}: {
  bookId: number
  priceInCents: number
  owned: boolean
  /** True when the current user has an active Premium subscription. */
  subscribed?: boolean
  /** Minimal book info used to add this book to the cart. */
  cartItem?: CartItem
  className?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const { has, add } = useCart()
  const { setOpen } = useCartUI()
  const inCart = has(bookId)

  // Runtime capability detection for the native Apple IAP module. Matches the
  // paywall's approach: never a URL flag, so the web build is never affected.
  const [iapAvailable, setIapAvailable] = useState(false)
  useEffect(() => {
    setIapAvailable(isSwingIapAvailable())
  }, [])

  function handleBuy() {
    startTransition(async () => {
      const res = await createBookCheckout(bookId)
      if (res.url) {
        window.location.href = res.url
      }
    })
  }

  // Owned outright, or unlocked through Premium — either way the book is
  // playable, so the primary action is to listen.
  if (owned || subscribed) {
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

  // Inside the iOS app: acquire the book by subscribing to Premium via Apple
  // In-App Purchase (StoreKit). No external checkout is presented.
  if (iapAvailable) {
    return (
      <div className={"flex flex-col gap-2 " + (className ?? "")}>
        <Button
          size="lg"
          className="gap-2"
          onClick={() => router.push("/subscribe")}
        >
          <Crown className="h-4 w-4" />
          Unlock with Premium
        </Button>
        <p className="text-sm text-muted-foreground">
          Premium unlocks this and every book in the library.
        </p>
      </div>
    )
  }

  // Web / non-iOS: the existing Stripe one-time purchase and cart flow.
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
