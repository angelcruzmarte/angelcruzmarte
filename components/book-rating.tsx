"use client"

import { useState, useTransition } from "react"
import { Star } from "lucide-react"
import { rateBook, type BookRatingSummary } from "@/app/actions/books"
import { cn } from "@/lib/utils"

/**
 * VOXYFI's own star ratings for a book (works for every book, including
 * affiliate titles). Shows the aggregate only once there are enough ratings;
 * otherwise "Not enough ratings yet" — never a link to Amazon reviews. Signed-in
 * users can submit or update their own rating inline. This is purely VOXYFI
 * data and never affects the Amazon purchase flow.
 */
export function BookRating({
  bookId,
  initial,
}: {
  bookId: number
  initial: BookRatingSummary
}) {
  const [summary, setSummary] = useState<BookRatingSummary>(initial)
  const [hover, setHover] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(stars: number) {
    setError(null)
    startTransition(async () => {
      const res = await rateBook(bookId, stars)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setSummary(res)
    })
  }

  const active = hover || summary.mine

  return (
    <section aria-labelledby="ratings-heading" className="mt-8">
      <h2 id="ratings-heading" className="mb-2 text-lg font-semibold">
        Reader ratings
      </h2>

      {summary.hasEnough ? (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn(
                  "h-5 w-5",
                  n <= Math.round(summary.average)
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40",
                )}
              />
            ))}
          </div>
          <span className="text-sm font-semibold">
            {summary.average.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">
            {"("}
            {summary.count} {summary.count === 1 ? "rating" : "ratings"}
            {")"}
          </span>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not enough ratings yet</p>
      )}

      {summary.canRate ? (
        <div className="mt-3">
          <p className="mb-1.5 text-sm font-medium">
            {summary.mine ? "Your rating" : "Rate this book"}
          </p>
          <div
            className="flex items-center gap-1"
            role="radiogroup"
            aria-label="Your rating"
            onMouseLeave={() => setHover(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={summary.mine === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                disabled={pending}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onBlur={() => setHover(0)}
                onClick={() => submit(n)}
                className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Star
                  className={cn(
                    "h-6 w-6",
                    n <= active
                      ? "fill-primary text-primary"
                      : "text-muted-foreground/40",
                  )}
                />
              </button>
            ))}
          </div>
          {error ? (
            <p className="mt-1.5 text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to rate this book.
        </p>
      )}
    </section>
  )
}
