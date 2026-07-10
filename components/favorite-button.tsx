"use client"

import { useState, useTransition } from "react"
import { Heart } from "lucide-react"
import { toggleFavorite } from "@/app/actions/books"
import { cn } from "@/lib/utils"

/**
 * Heart toggle to add/remove a book from the user's favorites. Optimistic:
 * flips immediately, reverts if the server rejects.
 */
export function FavoriteButton({
  bookId,
  initialFavorited = false,
  className,
  size = "md",
}: {
  bookId: number
  initialFavorited?: boolean
  className?: string
  size?: "sm" | "md"
}) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [, startTransition] = useTransition()

  function onToggle(e: React.MouseEvent) {
    // Prevent navigating when the heart sits inside a link/card.
    e.preventDefault()
    e.stopPropagation()
    const next = !favorited
    setFavorited(next)
    startTransition(async () => {
      const res = await toggleFavorite(bookId)
      if ("error" in res || typeof res.favorited !== "boolean") {
        setFavorited(!next) // revert on failure
        return
      }
      setFavorited(res.favorited)
    })
  }

  const dim = size === "sm" ? "h-4 w-4" : "h-5 w-5"

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      className={cn(
        "flex items-center justify-center rounded-full transition-colors",
        className,
      )}
    >
      <Heart
        className={cn(
          dim,
          "transition-colors",
          favorited
            ? "fill-primary text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      />
    </button>
  )
}
