"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BadgeCheck, Loader2 } from "lucide-react"
import { confirmCartCheckout } from "@/app/actions/books"
import { useCart } from "@/components/cart-provider"

/**
 * Handles the return from a cart Stripe Checkout. On `?checkout=success` it
 * reconciles ownership (fallback if the webhook hasn't landed), clears the
 * local cart, and shows a brief confirmation banner.
 */
export function CartReturnHandler() {
  const params = useSearchParams()
  const router = useRouter()
  const { clear } = useCart()
  const [state, setState] = useState<"idle" | "working" | "done">("idle")
  const ran = useRef(false)

  const checkout = params.get("checkout")
  const sessionId = params.get("session_id")

  useEffect(() => {
    if (ran.current) return
    if (checkout !== "success" || !sessionId) return
    ran.current = true
    setState("working")
    ;(async () => {
      await confirmCartCheckout(sessionId)
      clear()
      setState("done")
      // Clean the URL so a refresh doesn't re-trigger.
      router.replace("/app/books")
      router.refresh()
    })()
  }, [checkout, sessionId, clear, router])

  if (state === "idle") return null

  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
      {state === "working" ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Finalizing your purchase…
        </>
      ) : (
        <>
          <BadgeCheck className="h-4 w-4" />
          Purchase complete! Your books are in your{" "}
          <a href="/app/library" className="font-semibold underline">
            library
          </a>
          .
        </>
      )}
    </div>
  )
}
