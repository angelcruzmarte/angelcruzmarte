"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Check,
  Headphones,
  Heart,
  Plus,
  Search,
  ShoppingBag,
  Upload,
  X,
} from "lucide-react"
import type { Book, Document } from "@/lib/db/schema"
import { BookCover } from "@/components/book-cover"
import { FavoriteButton } from "@/components/favorite-button"
import { LiveBookResults } from "@/components/live-book-results"
import { CartReturnHandler } from "@/components/cart-return-handler"
import { UploadBook } from "@/components/upload-book"
import { useCart, type CartItem } from "@/components/cart-provider"
import { formatPrice } from "@/lib/plans"
import { cn } from "@/lib/utils"

// Preferred shelf order, grouped by parent (Fiction -> Nonfiction ->
// Children's). Categories not listed here are appended alphabetically after.
const CATEGORY_ORDER = [
  // Fiction
  "Mystery & Detective",
  "Science Fiction",
  "Fantasy",
  "Horror",
  "Adventure",
  "Historical Fiction",
  "Romance",
  "Thriller & Suspense",
  "Short Stories",
  "Classics",
  "Fiction",
  "Poetry",
  // Nonfiction
  "Biography & Memoir",
  "History",
  "Philosophy",
  "Psychology",
  "Politics",
  "Religion & Spirituality",
  "Science",
  "Mathematics",
  "Economics",
  "Self-Help",
  "Travel",
  "Nature & Environment",
  "Cooking & Recipes",
  // Children's
  "Children's Fiction",
  "Fairy Tales",
]

// A few pleasant cover colors for uploaded books (which have no artwork).
const UPLOAD_COLORS = [
  "#3b3f8f",
  "#8f3b5c",
  "#3b8f6f",
  "#8f6f3b",
  "#5c3b8f",
  "#3b6f8f",
]

function toCartItem(b: Book): CartItem {
  return {
    id: b.id,
    title: b.title,
    author: b.author,
    priceInCents: b.priceInCents,
    coverColor: b.coverColor,
    accentColor: b.accentColor,
    coverImageUrl: b.coverImageUrl,
  }
}

export function BooksStore({
  books,
  personalized,
  ownedIds = [],
  favoriteIds = [],
  uploads = [],
}: {
  books: Book[]
  personalized: boolean
  ownedIds?: number[]
  favoriteIds?: number[]
  uploads?: Document[]
}) {
  const owned = useMemo(() => new Set(ownedIds), [ownedIds])
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const { count, totalCents, setOpen } = useCart()

  // Group the catalog into Speechify-style shelves by category. Featured books
  // get their own shelf at the top.
  const shelves = useMemo(() => {
    const byCategory = new Map<string, Book[]>()
    for (const b of books) {
      const list = byCategory.get(b.category) ?? []
      list.push(b)
      byCategory.set(b.category, list)
    }
    const featured = books.filter((b) => b.featured)
    const result: Array<{ title: string; books: Book[] }> = []
    if (featured.length > 0) {
      result.push({ title: "Featured", books: featured })
    }
    // Order categories by the curated list, then any extras alphabetically.
    const categories = Array.from(byCategory.keys()).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a)
      const ib = CATEGORY_ORDER.indexOf(b)
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
    for (const category of categories) {
      result.push({ title: category, books: byCategory.get(category)! })
    }
    return result
  }, [books])

  const favoriteBooks = useMemo(
    () => books.filter((b) => favorites.has(b.id)),
    [books, favorites],
  )

  const [showSearch, setShowSearch] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)

  // Live catalog search (debounced).
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(id)
  }, [query])
  const searching = debounced.length > 0

  return (
    <div className="space-y-7">
      <CartReturnHandler />

      {/* Header: title + cart / search / favorites controls */}
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Book Store</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
            className="relative flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold transition-colors hover:bg-secondary"
          >
            <ShoppingBag className="h-4 w-4 text-primary" />
            {count > 0 ? formatPrice(totalCents) : "$0"}
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                {count}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSearch((s) => !s)
              setShowFavorites(false)
            }}
            aria-label="Search books"
            aria-pressed={showSearch}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              showSearch
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowFavorites((s) => !s)
              setShowSearch(false)
            }}
            aria-label="Show favorites"
            aria-pressed={showFavorites}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border transition-colors",
              showFavorites
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            <Heart
              className={cn("h-4 w-4", showFavorites && "fill-current")}
            />
          </button>
        </div>
      </header>

      {/* Search field (revealed by the search button) */}
      {showSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            autoFocus
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
      )}

      {showSearch && searching ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Results for &ldquo;{debounced}&rdquo;
          </h2>
          <LiveBookResults query={debounced} />
        </section>
      ) : showFavorites ? (
        <FavoritesView
          favoriteBooks={favoriteBooks}
          owned={owned}
          favorites={favorites}
        />
      ) : (
        <>
          {/* Upload your own books (free to listen) */}
          <section>
            <UploadBook />
          </section>

          {/* Your uploaded books */}
          {uploads.length > 0 && <UploadsShelf uploads={uploads} />}

          {/* Speechify-style category shelves */}
          {shelves.map((shelf) => (
            <BookShelf
              key={shelf.title}
              title={shelf.title}
              books={shelf.books}
              owned={owned}
              favorites={favorites}
            />
          ))}
        </>
      )}
    </div>
  )
}

function FavoritesView({
  favoriteBooks,
  owned,
  favorites,
}: {
  favoriteBooks: Book[]
  owned: Set<number>
  favorites: Set<number>
}) {
  if (favoriteBooks.length === 0) {
    return (
      <section className="flex flex-col items-center gap-2 py-16 text-center">
        <Heart className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No favorites yet. Tap the heart on any book to save it here.
        </p>
      </section>
    )
  }
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Heart className="h-5 w-5 fill-primary text-primary" />
        Your favorites
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {favoriteBooks.map((book) => (
          <StoreBookCard
            key={book.id}
            book={book}
            owned={owned.has(book.id)}
            favorited={favorites.has(book.id)}
          />
        ))}
      </div>
    </section>
  )
}

function BookShelf({
  title,
  books,
  owned,
  favorites,
}: {
  title: string
  books: Book[]
  owned: Set<number>
  favorites: Set<number>
}) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-bold tracking-tight">{title}</h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {books.map((book) => (
          <div key={book.id} className="w-32 shrink-0 sm:w-36">
            <StoreBookCard
              book={book}
              owned={owned.has(book.id)}
              favorited={favorites.has(book.id)}
            />
          </div>
        ))}
      </div>
    </section>
  )
}

function StoreBookCard({
  book,
  owned,
  favorited,
}: {
  book: Book
  owned: boolean
  favorited: boolean
}) {
  const { has, add, remove } = useCart()
  const inCart = has(book.id)

  return (
    <div className="group flex flex-col gap-2">
      <div className="relative">
        <Link href={`/app/books/${book.id}`} aria-label={book.title}>
          <BookCover
            book={book}
            className="w-full transition-transform group-hover:-translate-y-1"
          />
        </Link>
        <FavoriteButton
          bookId={book.id}
          initialFavorited={favorited}
          size="sm"
          className="absolute left-1.5 top-1.5 h-7 w-7 bg-card/90 shadow-sm backdrop-blur"
        />
        <span
          className={cn(
            "absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm",
            owned
              ? "bg-primary text-primary-foreground"
              : "bg-card/90 text-foreground backdrop-blur",
          )}
        >
          {owned ? "Owned" : formatPrice(book.priceInCents)}
        </span>
      </div>
      <div className="min-w-0">
        <Link href={`/app/books/${book.id}`}>
          <p className="truncate text-sm font-semibold">{book.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {book.author}
          </p>
        </Link>
      </div>
      {owned ? (
        <Link
          href={`/app/listen/book/${book.id}`}
          className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-secondary text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          <Headphones className="h-3.5 w-3.5" />
          Listen
        </Link>
      ) : inCart ? (
        <button
          type="button"
          onClick={() => remove(book.id)}
          className="flex h-8 items-center justify-center gap-1.5 rounded-full border border-primary bg-primary/10 text-xs font-semibold text-primary transition-colors"
        >
          <Check className="h-3.5 w-3.5" />
          In cart
        </button>
      ) : (
        <button
          type="button"
          onClick={() => add(toCartItem(book))}
          className="flex h-8 items-center justify-center gap-1.5 rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      )}
    </div>
  )
}

function UploadsShelf({ uploads }: { uploads: Document[] }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold tracking-tight">
        <Headphones className="h-5 w-5 text-primary" />
        Your uploads
      </h2>
      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {uploads.map((doc, i) => {
          const progress =
            doc.wordCount > 0
              ? Math.min(99, Math.round((doc.lastWord / doc.wordCount) * 100))
              : 0
          return (
            <Link
              key={doc.id}
              href={`/app/listen/${doc.id}`}
              className="group flex w-32 shrink-0 flex-col gap-2 sm:w-36"
            >
              <div className="relative">
                <div
                  className="relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-lg p-3 shadow-md transition-transform group-hover:-translate-y-1"
                  style={{
                    backgroundColor: UPLOAD_COLORS[i % UPLOAD_COLORS.length],
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
                <p className="truncate text-sm font-semibold">{doc.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {progress > 0 ? `${progress}% listened` : "Tap to listen"}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
