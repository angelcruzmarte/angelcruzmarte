"use client"

import { useEffect, useState, useTransition } from "react"
import { createPortal } from "react-dom"
import { Loader2, ShoppingBag, Trash2, X } from "lucide-react"
import { createCartCheckout } from "@/app/actions/books"
import { useCart, useCartUI } from "@/components/cart-provider"
import { usePlatform } from "@/hooks/use-platform"
import { BookCover } from "@/components/book-cover"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/plans"

export function CartDrawer() {
  const { items, totalCents, remove } = useCart()
  const { open, setOpen } = useCartUI()
  const { isIOS } = usePlatform()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Apple Guideline 3.1.1: the cart is a native purchase surface, never shown
  // inside the iOS app.
  if (isIOS) return null
  if (!mounted || !open) return null

  function checkout() {
    setError(null)
    startTransition(async () => {
      const res = await createCartCheckout(items.map((i) => i.id))
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.url) window.location.href = res.url
    })
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close cart"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />
      <div className="relative z-10 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShoppingBag className="h-5 w-5 text-primary" />
            Your cart
            {items.length > 0 && (
              <span className="text-sm font-normal text-muted-foreground">
                ({items.length})
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Your cart is empty. Add books from the store to buy them all at
                once.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3">
                  <BookCover book={item} className="w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.author}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatPrice(item.priceInCents)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.title} from cart`}
                    className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {items.length > 0 && (
          <div className="shrink-0 border-t border-border px-5 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            {error && (
              <p className="mb-2 text-sm text-destructive">{error}</p>
            )}
            <div className="mb-3 flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatPrice(totalCents)}</span>
            </div>
            <Button
              size="lg"
              className="w-full gap-2"
              onClick={checkout}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShoppingBag className="h-4 w-4" />
              )}
              Checkout · {formatPrice(totalCents)}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Secure one-time payment. Books are added to your library
              instantly.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
