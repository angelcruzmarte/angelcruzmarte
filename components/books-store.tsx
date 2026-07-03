"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"
import type { Book } from "@/lib/db/schema"
import { BookCover } from "@/components/book-cover"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/plans"
import { cn } from "@/lib/utils"

export function BooksStore({
  books,
  personalized,
  ownedIds = [],
}: {
  books: Book[]
  personalized: boolean
  ownedIds?: number[]
}) {
  const owned = useMemo(() => new Set(ownedIds), [ownedIds])

  const categories = useMemo(() => {
    const set = new Set(books.map((b) => b.category))
    return ["All", ...Array.from(set).sort()]
  }, [books])

  const [active, setActive] = useState("All")
  const [showOnboarding, setShowOnboarding] = useState(!personalized)

  const filtered =
    active === "All" ? books : books.filter((b) => b.category === active)

  const featured = books.filter((b) => b.featured).slice(0, 6)

  return (
    <div className="space-y-6">
      {showOnboarding && (
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <div className="mb-4 flex justify-center gap-2">
            {featured.slice(0, 4).map((b) => (
              <BookCover key={b.id} book={b} className="w-16" />
            ))}
          </div>
          <h2 className="text-xl font-bold text-balance">
            Welcome to the Book Store!
          </h2>
          <p className="mt-1 text-pretty text-muted-foreground">
            Let&apos;s find your perfect reads.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link href="/app/discover">
              <Button size="lg" className="w-full gap-2">
                <Sparkles className="h-4 w-4" />
                Get personalized picks
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-primary"
              onClick={() => setShowOnboarding(false)}
            >
              Continue to Book Store
            </Button>
          </div>
        </div>
      )}

      {personalized && (
        <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm text-primary">
          <Sparkles className="h-4 w-4" />
          Sorted by your interests.{" "}
          <Link href="/app/discover" className="font-semibold underline">
            Edit
          </Link>
        </div>
      )}

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActive(cat)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              active === cat
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary",
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {filtered.map((book) => (
          <Link
            key={book.id}
            href={`/app/books/${book.id}`}
            className="group flex flex-col gap-2"
          >
            <div className="relative">
              <BookCover
                book={book}
                className="w-full transition-transform group-hover:-translate-y-1"
              />
              <span
                className={cn(
                  "absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm",
                  owned.has(book.id)
                    ? "bg-primary text-primary-foreground"
                    : "bg-card/90 text-foreground backdrop-blur",
                )}
              >
                {owned.has(book.id) ? "Owned" : formatPrice(book.priceInCents)}
              </span>
            </div>
            <div>
              <p className="truncate text-sm font-semibold">{book.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {book.author}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
