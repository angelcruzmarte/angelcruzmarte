"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Headphones, Search, Sparkles, Store, Upload, X } from "lucide-react"
import type { Book, Document } from "@/lib/db/schema"
import { BookCover } from "@/components/book-cover"
import { LiveBookResults } from "@/components/live-book-results"
import { UploadBook } from "@/components/upload-book"
import { formatPrice } from "@/lib/plans"
import { cn } from "@/lib/utils"

// A few pleasant cover colors for uploaded books (which have no artwork).
const UPLOAD_COLORS = [
  "#3b3f8f",
  "#8f3b5c",
  "#3b8f6f",
  "#8f6f3b",
  "#5c3b8f",
  "#3b6f8f",
]

export function BooksStore({
  books,
  personalized,
  ownedIds = [],
  uploads = [],
}: {
  books: Book[]
  personalized: boolean
  ownedIds?: number[]
  uploads?: Document[]
}) {
  const owned = useMemo(() => new Set(ownedIds), [ownedIds])

  const categories = useMemo(() => {
    const set = new Set(books.map((b) => b.category))
    return ["All", ...Array.from(set).sort()]
  }, [books])

  const [active, setActive] = useState("All")

  const filtered =
    active === "All" ? books : books.filter((b) => b.category === active)

  // Live catalog search (Open Library). Debounced so we don't fire on every
  // keystroke.
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(id)
  }, [query])
  const searching = debounced.length > 0

  return (
    <div className="space-y-8">
      {/* Upload your own books (free to listen) */}
      <section>
        <UploadBook />
      </section>

      {/* Search the entire live catalog */}
      <section>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search millions of books by title or author…"
            aria-label="Search the book store"
            className="h-11 w-full rounded-xl border border-border bg-card pl-9 pr-9 text-sm outline-none ring-primary/30 transition focus:ring-2"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </section>

      {/* Live search results replace the curated shelves while searching. */}
      {searching ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Store className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">
              Results for &ldquo;{debounced}&rdquo;
            </h2>
          </div>
          <LiveBookResults query={debounced} />
        </section>
      ) : (
        <StoreShelves />
      )}
    </div>
  )

  function StoreShelves() {
    return (
      <>
        {/* Your uploaded books */}
        {uploads.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Your uploads</h2>
            <span className="text-sm text-muted-foreground">
              {uploads.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {uploads.map((doc, i) => {
              const progress =
                doc.wordCount > 0
                  ? Math.min(99, Math.round((doc.lastWord / doc.wordCount) * 100))
                  : 0
              return (
                <Link
                  key={doc.id}
                  href={`/app/listen/${doc.id}`}
                  className="group flex flex-col gap-2"
                >
                  <div className="relative">
                    <div
                      className="relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-lg p-3 shadow-md transition-transform group-hover:-translate-y-1"
                      style={{
                        backgroundColor:
                          UPLOAD_COLORS[i % UPLOAD_COLORS.length],
                      }}
                    >
                      <Upload className="h-5 w-5 text-white/70" aria-hidden />
                      <p
                        className="text-pretty text-[0.95rem] font-bold leading-tight text-white"
                        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
                      >
                        {doc.title}
                      </p>
                    </div>
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
                      Free
                    </span>
                  </div>
                  <div>
                    <p className="truncate text-sm font-semibold">
                      {doc.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {progress > 0 ? `${progress}% listened` : "Tap to listen"}
                    </p>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Purchasable store catalog */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Book Store</h2>
        </div>

        {personalized && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2.5 text-sm text-primary">
            <Sparkles className="h-4 w-4" />
            Sorted by your interests.{" "}
            <Link href="/app/discover" className="font-semibold underline">
              Edit
            </Link>
          </div>
        )}

        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
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
                  {owned.has(book.id)
                    ? "Owned"
                    : formatPrice(book.priceInCents)}
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
      </section>
      </>
    )
  }
}
