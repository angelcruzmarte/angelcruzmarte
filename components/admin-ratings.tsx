"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BarChart3, BookOpen, Loader2, Star, Trash2 } from "lucide-react"
import {
  deleteRating,
  type BookRatingRow,
  type ModerationLogRow,
  type RatingsOverview,
} from "@/app/actions/admin-moderation"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Admin Book Ratings management. Replaces the former written-review moderation
 * queue: it shows real rating statistics, per-book average / count /
 * distribution, and any invalid (out-of-range) records an admin can remove.
 * Every removal is recorded in the moderation audit trail shown below. There is
 * no written-review content anywhere — Voxyfi collects numeric ratings only.
 */
export function AdminBookRatings({
  overview,
  log,
}: {
  overview: RatingsOverview
  log: ModerationLogRow[]
}) {
  const { stats, books, invalid } = overview

  const cards = [
    { label: "Total ratings", value: stats.totalRatings.toLocaleString() },
    { label: "Books rated", value: stats.booksRated.toLocaleString() },
    {
      label: "Average rating",
      value: stats.totalRatings > 0 ? stats.averageRating.toFixed(1) : "—",
    },
  ]

  return (
    <div className="space-y-10">
      {/* Headline stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{c.label}</span>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {c.value}
            </p>
          </Card>
        ))}
      </div>

      {/* Recent ratings */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Recent ratings</h2>
        {stats.recentRatings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ratings yet.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {stats.recentRatings.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <Link
                  href={`/app/books/${r.bookId}`}
                  className="min-w-0 truncate text-sm font-medium underline-offset-2 hover:underline"
                >
                  {r.bookTitle}
                </Link>
                <div className="flex shrink-0 items-center gap-3">
                  <Stars value={r.stars} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Per-book ratings */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Book ratings</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Average, total ratings, and distribution per book — computed from
          actual rating records.
        </p>
        {books.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No books have been rated yet.
          </p>
        ) : (
          <ul className="space-y-4">
            {books.map((b) => (
              <BookRatingCard key={b.bookId} book={b} />
            ))}
          </ul>
        )}
      </section>

      {/* Invalid records */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Invalid rating records</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Ratings outside the valid 1–5 range. Remove any invalid record; the
          action is recorded in the audit trail.
        </p>
        {invalid.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No invalid ratings found.
          </p>
        ) : (
          <ul className="space-y-3">
            {invalid.map((r) => (
              <InvalidRatingCard key={r.id} rating={r} />
            ))}
          </ul>
        )}
      </section>

      {/* Audit trail */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Moderation audit trail</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No moderation actions recorded yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">Admin</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                  <th className="px-3 py-2 font-medium">Target</th>
                  <th className="px-3 py-2 font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className="border-t border-border">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{e.actorName || e.actorEmail}</td>
                    <td className="px-3 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {e.action}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[e.targetType, e.targetId, e.targetUserId]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.note || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function BookRatingCard({ book }: { book: BookRatingRow }) {
  const max = Math.max(
    book.distribution[5],
    book.distribution[4],
    book.distribution[3],
    book.distribution[2],
    book.distribution[1],
    1,
  )
  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/app/books/${book.bookId}`}
            className="flex items-center gap-1.5 text-sm font-semibold underline-offset-2 hover:underline"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{book.title}</span>
          </Link>
          {book.author ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {book.author}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Stars value={Math.round(book.average)} />
          <span className="text-sm font-semibold tabular-nums">
            {book.average.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">
            {book.count.toLocaleString()}{" "}
            {book.count === 1 ? "rating" : "ratings"}
          </span>
        </div>
      </div>

      {/* Distribution 5★ → 1★ */}
      <div className="mt-4 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const n = book.distribution[star]
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="flex w-8 shrink-0 items-center gap-0.5 tabular-nums text-muted-foreground">
                {star}
                <Star className="h-3 w-3 fill-primary text-primary" />
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                {n.toLocaleString()}
              </span>
            </div>
          )
        })}
      </div>
    </li>
  )
}

function InvalidRatingCard({
  rating,
}: {
  rating: RatingsOverview["invalid"][number]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function remove() {
    setError(null)
    start(async () => {
      try {
        const res = await deleteRating(rating.id)
        if (res && "error" in res && res.error) {
          setError(res.error)
          return
        }
        router.refresh()
      } catch {
        setError("That action couldn't be completed. Please try again.")
      }
    })
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{rating.bookTitle}</p>
        <p className="text-xs text-muted-foreground">
          Rating #{rating.id} · value{" "}
          <span className="font-semibold text-destructive">{rating.stars}</span>{" "}
          · user {rating.userId.slice(0, 8)} ·{" "}
          {new Date(rating.createdAt).toLocaleDateString()}
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={remove}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Remove
      </button>
    </li>
  )
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "h-4 w-4",
            n <= value ? "fill-primary text-primary" : "text-muted-foreground/40",
          )}
        />
      ))}
    </span>
  )
}
