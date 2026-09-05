"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MoreVertical, Pencil, Star } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ReportContentDialog } from "@/components/report-content-dialog"
import { blockUser } from "@/app/actions/moderation"
import { submitReview } from "@/app/actions/reviews"
import { CONTENT_TYPE_BOOK_REVIEW, type PublicReview } from "@/lib/moderation"
import { cn } from "@/lib/utils"

type Viewer = { id: string; canPost: boolean }

/**
 * Written book reviews — Voxyfi's user-generated content surface. Renders every
 * user's review with their public identity, lets the signed-in user write/edit
 * their own, and exposes Report + Block controls on other users' reviews. This
 * is the screen an Apple reviewer uses: view another user's review, report it,
 * then block the author so their content disappears.
 */
export function BookReviews({
  bookId,
  initialReviews,
  viewer,
  initialMyStars,
}: {
  bookId: number
  initialReviews: PublicReview[]
  viewer: Viewer | null
  initialMyStars: number
}) {
  const router = useRouter()
  const [reviews, setReviews] = useState<PublicReview[]>(initialReviews)
  const [reportId, setReportId] = useState<number | null>(null)
  const [blockTarget, setBlockTarget] = useState<PublicReview | null>(null)
  const [blocking, startBlock] = useTransition()

  const mine = useMemo(
    () => reviews.find((r) => r.isMine) ?? null,
    [reviews],
  )
  const others = reviews.filter((r) => !r.isMine)

  const [editing, setEditing] = useState(false)

  function confirmBlock() {
    if (!blockTarget) return
    const targetUserId = blockTarget.userId
    startBlock(async () => {
      const res = await blockUser(targetUserId)
      setBlockTarget(null)
      if ("error" in res && res.error) return
      // Optimistically drop every review by the blocked author, then refresh
      // so server-side filtering (feed/discovery) reflects the block too.
      setReviews((prev) => prev.filter((r) => r.userId !== targetUserId))
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="reviews-heading" className="mt-8">
      <h2 id="reviews-heading" className="mb-3 text-lg font-semibold">
        Reader reviews
      </h2>

      {/* Write / edit your own review */}
      {viewer?.canPost ? (
        <ReviewForm
          bookId={bookId}
          initialStars={mine?.stars ?? initialMyStars}
          initialText={mine?.review ?? ""}
          isEditing={Boolean(mine) || editing}
          onSaved={() => {
            setEditing(false)
            router.refresh()
          }}
        />
      ) : viewer ? (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Your account is not able to post reviews right now.
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">
          Sign in to write a review.
        </p>
      )}

      {/* Your existing review (with an edit affordance) */}
      {mine ? (
        <div className="mt-4">
          <ReviewCard review={mine} highlight />
        </div>
      ) : null}

      {/* Everyone else's reviews */}
      <div className="mt-4 space-y-4">
        {reviews.length === 0 ? (
          // Empty state shows ONLY when there are genuinely zero reviews —
          // not when the sole review is the viewer's own (rendered above).
          <p className="text-sm text-muted-foreground">
            No reviews yet. Be the first to share your thoughts.
          </p>
        ) : (
          others.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              viewer={viewer}
              onReport={() => setReportId(r.id)}
              onBlock={() => setBlockTarget(r)}
            />
          ))
        )}
      </div>

      {/* Report modal (shared, driven by which review id is set) */}
      <ReportContentDialog
        contentType={CONTENT_TYPE_BOOK_REVIEW}
        contentId={reportId != null ? String(reportId) : ""}
        open={reportId != null}
        onOpenChange={(o) => {
          if (!o) setReportId(null)
        }}
      />

      {/* Block confirmation */}
      <AlertDialog
        open={blockTarget != null}
        onOpenChange={(o) => {
          if (!o) setBlockTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Block {blockTarget ? displayName(blockTarget) : "this user"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You won&apos;t see their reviews or other content anywhere on
              Voxyfi, and they won&apos;t be able to interact with you. You can
              unblock them later from Settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={blocking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmBlock()
              }}
              disabled={blocking}
            >
              {blocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Block user"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function ReviewForm({
  bookId,
  initialStars,
  initialText,
  isEditing,
  onSaved,
}: {
  bookId: number
  initialStars: number
  initialText: string
  isEditing: boolean
  onSaved: () => void
}) {
  const [stars, setStars] = useState(initialStars || 0)
  const [hover, setHover] = useState(0)
  const [text, setText] = useState(initialText)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const active = hover || stars

  function save() {
    setError(null)
    if (stars < 1) {
      setError("Please choose a star rating.")
      return
    }
    startTransition(async () => {
      const res = await submitReview(bookId, stars, text)
      if ("error" in res && res.error) {
        setError(res.error)
        return
      }
      onSaved()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="mb-1.5 text-sm font-medium">
        {isEditing ? "Edit your review" : "Write a review"}
      </p>
      <div
        className="mb-3 flex items-center gap-1"
        role="radiogroup"
        aria-label="Your rating"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            disabled={pending}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => setStars(n)}
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
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Share your thoughts about this book (optional)."
      />
      {error ? <p className="mt-1.5 text-sm text-destructive">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEditing ? (
            "Update review"
          ) : (
            "Post review"
          )}
        </Button>
      </div>
    </div>
  )
}

function ReviewCard({
  review,
  viewer,
  highlight,
  onReport,
  onBlock,
}: {
  review: PublicReview
  viewer?: Viewer | null
  highlight?: boolean
  onReport?: () => void
  onBlock?: () => void
}) {
  const showMenu = !review.isMine && viewer != null && onReport && onBlock
  return (
    <article
      className={cn(
        "rounded-xl border p-4",
        highlight ? "border-primary/40 bg-primary/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={review.authorName} image={review.authorImage} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {review.authorName}
                {review.isMine ? (
                  <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                    You
                  </span>
                ) : null}
              </p>
              {review.authorUsername ? (
                <p className="truncate text-xs text-muted-foreground">
                  @{review.authorUsername}
                </p>
              ) : null}
            </div>
            {showMenu ? (
              <DropdownMenu>
                {/* Always-visible, touch-sized (44x44) trigger so the Report /
                    Block menu is reliably tappable on mobile — not a
                    hover-only icon. */}
                <DropdownMenuTrigger
                  className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent"
                  aria-label={`Options for ${review.authorName}'s review`}
                >
                  <MoreVertical className="h-5 w-5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => onReport?.()}>
                    Report Review
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => onBlock?.()}
                  >
                    Block User
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          <div className="mt-1 flex items-center gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={cn(
                  "h-3.5 w-3.5",
                  n <= review.stars
                    ? "fill-primary text-primary"
                    : "text-muted-foreground/40",
                )}
              />
            ))}
            <span className="sr-only">{review.stars} out of 5 stars</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {new Date(review.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </div>

          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-pretty">
            {review.review}
          </p>
        </div>
      </div>
    </article>
  )
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  const initials =
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-bold text-foreground">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

function displayName(r: PublicReview): string {
  return r.authorUsername ? `@${r.authorUsername}` : r.authorName
}
