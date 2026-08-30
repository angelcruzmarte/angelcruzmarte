"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"

/** Minimal book info kept in the cart so the drawer renders without refetching. */
export type CartItem = {
  id: number
  title: string
  author: string
  priceInCents: number
  coverColor: string
  accentColor: string
  coverImageUrl: string | null
}

type CartContextValue = {
  items: CartItem[]
  count: number
  totalCents: number
  has: (id: number) => boolean
  add: (item: CartItem) => void
  remove: (id: number) => void
  clear: () => void
}

// The drawer open/close state lives in its OWN context, separate from the cart
// contents. Toggling the drawer is a very common interaction; if it shared the
// cart value, every `useCart()` consumer (hundreds of memoized book cards)
// would re-render on each open/close. Keeping it separate means only the drawer
// and the trigger re-render.
type CartUIContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)
const CartUIContext = createContext<CartUIContextValue | null>(null)

const STORAGE_KEY = "voxyfi.cart.v1"

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [open, setOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load persisted cart once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setItems(JSON.parse(raw) as CartItem[])
    } catch {
      // ignore malformed storage
    }
    setHydrated(true)
  }, [])

  // Persist whenever the cart changes (after initial hydration).
  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // ignore quota errors
    }
  }, [items, hydrated])

  const add = useCallback((item: CartItem) => {
    setItems((prev) =>
      prev.some((i) => i.id === item.id) ? prev : [...prev, item],
    )
  }, [])

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  // Cart-contents value — intentionally does NOT depend on `open`, so opening
  // the drawer doesn't re-render card consumers.
  const value = useMemo<CartContextValue>(() => {
    return {
      items,
      count: items.length,
      totalCents: items.reduce((sum, i) => sum + i.priceInCents, 0),
      has: (id: number) => items.some((i) => i.id === id),
      add,
      remove,
      clear,
    }
  }, [items, add, remove, clear])

  const uiValue = useMemo<CartUIContextValue>(
    () => ({ open, setOpen }),
    [open],
  )

  return (
    <CartContext.Provider value={value}>
      <CartUIContext.Provider value={uiValue}>
        {children}
      </CartUIContext.Provider>
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error("useCart must be used within a CartProvider")
  return ctx
}

export function useCartUI() {
  const ctx = useContext(CartUIContext)
  if (!ctx) throw new Error("useCartUI must be used within a CartProvider")
  return ctx
}
