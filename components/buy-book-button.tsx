"use client"

import { useRouter } from "next/navigation"
import { Crown, Headphones } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Book detail primary action.
 *
 * Access to a book's full text/audio is granted by EITHER already owning the
 * book (a legacy one-time purchase that is grandfathered in) OR an active
 * Premium subscription. VOXYFI now monetizes books ONLY through Premium
 * ("Unlimited access to the full library") — individual titles are no longer
 * sold — so anyone who doesn't yet have access is routed to the Premium paywall.
 *
 * Apple Guideline 3.1.1: the paywall runs Apple In-App Purchase inside the iOS
 * app and Stripe on the web, so no external checkout or price for digital goods
 * is ever presented here, on any platform.
 */
export function BuyBookButton({
  bookId,
  owned,
  subscribed = false,
  className,
}: {
  bookId: number
  owned: boolean
  /** True when the current user has an active Premium subscription. */
  subscribed?: boolean
  className?: string
}) {
  const router = useRouter()

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

  // Everyone else acquires the book by subscribing to Premium. The paywall
  // handles the correct payment rail per platform (Apple IAP on iOS, Stripe on
  // web), so no price or external checkout is shown here.
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
