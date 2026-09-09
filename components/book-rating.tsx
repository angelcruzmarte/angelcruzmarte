"use client"

import { useState, useTransition } from "react"
import { Star } from "lucide-react"
import { rateBook } from "@/app/actions/books"
import type { BookRatingSummary } from "@/lib/ratings"
import { cn } from "@/lib/utils"

/**
 * VOXYFI's own 1-5 star rating for a book (works for every book, including
 * affiliate titles). Shows the ACTUAL average and number of ratings from the
 * database, or a "No ratings yet" empty state. Signed-in users can submit a
 * rating; each user has exactly one rating per book, which they can change at
 * any time. This is purely VOXYFI data and never affects the Amazon purchase
 * flow. Voxyfi collects a numeric rating only — never written reviews.
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
  // Whether the interactive picker is shown. Open by default until the user has
  // a rating; after they rate we collapse to "Your rating" + "Change rating".
  const [editing, setEditing] = useState(false)
  const [thanks, setThanks] = useState(false)
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
      setEditing(false)
      setThanks(true)
    })
  }

  const hasRated = summary.mine > 0
  const showPicker = !hasRated || editing
  const active = hover || (editing ? 0 : summary.mine)

  return (
    <section aria-labelledby="ratings-heading" className="mt-8">
      <h2 id="ratings-heading" className="mb-2 text-lg font-semibold">
        Reader ratings
      </h2>

      {/* Aggregate: actual average + count, or the empty state. */}
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
            {summary.count.toLocaleString()}{" "}
            {summary.count === 1 ? "rating" : "ratings"}
          </span>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium">No ratings yet</p>
          <p className="text-sm text-muted-foreground">
            Be the first to rate this book.
          </p>
        </div>
      )}

      {/* Rating control */}
      {summary.canRate ? (
        <div className="mt-4">
          {showPicker ? (
            <>
              <p className="mb-1.5 text-sm font-medium">
                {hasRated ? "Change your rating" : "Rate this book"}
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
                    aria-checked={active === n}
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
                        "h-7 w-7",
                        n <= active
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                ))}
              </div>
              {hasRated ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setHover(0)
                  }}
                  className="mt-2 text-sm font-medium text-muted-foreground underline-offset-2 hover:underline"
                >
                  Cancel
                </button>
              ) : null}
            </>
          ) : (
            <>
              <p className="mb-1.5 text-sm font-medium">Your rating</p>
              <div className="flex items-center gap-0.5" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "h-7 w-7",
                      n <= summary.mine
                        ? "fill-primary text-primary"
                        : "text-muted-foreground/40",
                    )}
                  />
                ))}
              </div>
              <span className="sr-only">
                You rated this book {summary.mine} out of 5 stars.
              </span>
              {thanks ? (
                <p className="mt-2 text-sm text-primary">
                  Thank you for rating this book.
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setThanks(false)
                  setEditing(true)
                }}
                className="mt-2 text-sm font-medium text-primary underline-offset-2 hover:underline"
              >
                Change rating
              </button>
            </>
          )}
          {error ? (
            <p className="mt-1.5 text-sm text-destructive">{error}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in to rate this book.
        </p>
      )}
    </section>
  )
}
