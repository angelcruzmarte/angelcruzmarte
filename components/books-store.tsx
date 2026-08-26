"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Blocks,
  BookOpen,
  Brain,
  Calculator,
  Castle,
  Check,
  ChevronRight,
  Church,
  Compass,
  Crown,
  Drama,
  Feather,
  FileText,
  FlaskConical,
  Ghost,
  Globe,
  Headphones,
  Heart,
  Landmark,
  Laugh,
  Leaf,
  type LucideIcon,
  Plane,
  Plus,
  Rocket,
  Scale,
  ScrollText,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserRound,
  X,
  Zap,
} from "lucide-react"
// The store only renders card-level fields, so it works on the lightweight
// BookCard shape (no heavy full-text `content`). Aliased to Book locally.
import type { BookCard as Book, Document } from "@/lib/db/schema"
import type { Storefront } from "@/app/actions/books"
import { BookCover } from "@/components/book-cover"
import {
  BookCard as StoreCard,
  type BookCardAction,
  type BookCardBadge,
} from "@/components/store/book-card"
import { FavoriteButton } from "@/components/favorite-button"
import { LiveBookResults } from "@/components/live-book-results"
import type { Suggestion } from "@/app/api/store/suggest/route"

// A search suggestion tagged with whether it comes from our own catalog
// (native) or an external source (Open Library / Amazon).
type MergedSuggestion = Suggestion & { native?: boolean }
import { CartReturnHandler } from "@/components/cart-return-handler"
import { UploadBook } from "@/components/upload-book"
import { useCart, type CartItem } from "@/components/cart-provider"
import { usePlatform } from "@/hooks/use-platform"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { formatPrice } from "@/lib/plans"
import { languageLabel } from "@/lib/languages"
import { cn } from "@/lib/utils"

// How many books to show per curated storefront row. The server sends a
// language-aware pool (up to this many per language); the client slices to
// this size after applying the active language filter. Mirrors ROW_SIZE in
// app/actions/books.ts.
const SHELF_SIZE = 12

// Max books mounted in a single "Browse by category" horizontal shelf. These
// are scrollable browse rows, not exhaustive lists, so capping keeps the DOM
// light with a 15K+ catalog. The genre nav still shows the true total.
const SHELF_BROWSE_CAP = 24

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

// Stable anchor id for a category so the genre nav can jump to its shelf.
function genreSlug(category: string) {
  return `genre-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
}

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
  storefront,
  personalized,
  ownedIds = [],
  favoriteIds = [],
  uploads = [],
}: {
  books: Book[]
  storefront?: Storefront
  personalized: boolean
  ownedIds?: number[]
  favoriteIds?: number[]
  uploads?: Document[]
}) {
  const owned = useMemo(() => new Set(ownedIds), [ownedIds])
  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const { count, totalCents, setOpen } = useCart()
  const { isIOS } = usePlatform()

  // Language handling. The store defaults to English; other languages are only
  // surfaced on demand via the language picker (search-on-demand), never as a
  // long list of chips upfront.
  const [languageFilter, setLanguageFilter] = useState<string>("en")
  const languages = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of books) {
      const code = b.language || "en"
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => {
        if (a[0] === "en") return -1
        if (b[0] === "en") return 1
        return b[1] - a[1]
      })
      .map(([code, count]) => ({ code, count }))
  }, [books])

  // Books matching the active language filter ("all" shows every language).
  const visibleBooks = useMemo(
    () =>
      languageFilter === "all"
        ? books
        : books.filter((b) => (b.language || "en") === languageFilter),
    [books, languageFilter],
  )
  // English and "All languages" get the full curated storefront; a specific
  // non-English language shows a focused, category-only view.
  const showRichStorefront = languageFilter === "en" || languageFilter === "all"
  const filteringLanguage = !showRichStorefront

  // Enforce the language filter on the curated storefront as well: the hero and
  // every curated row must contain only books of the active language, so the
  // English store never surfaces a Chinese/Japanese/etc. spotlight. "All
  // languages" keeps the original cross-language storefront.
  const localizedStorefront = useMemo<Storefront | undefined>(() => {
    if (!storefront) return storefront
    // "All languages": keep the cross-language pool (English-led) and cap each
    // row to the shelf size. The server sends a larger per-language pool, so we
    // must slice here rather than render the whole pool.
    if (languageFilter === "all") {
      return {
        hero: storefront.hero,
        rows: storefront.rows
          .map((row) => ({ ...row, books: row.books.slice(0, SHELF_SIZE) }))
          .filter((row) => row.books.length > 0),
      }
    }
    // A specific language: filter every row to that language, then slice. The
    // language-aware pool guarantees enough books survive the filter to fill a
    // shelf even when the newest catalog additions skew to another language.
    const inLang = (b: Book) => (b.language || "en") === languageFilter
    const rows = storefront.rows
      .map((row) => ({ ...row, books: row.books.filter(inLang).slice(0, SHELF_SIZE) }))
      .filter((row) => row.books.length > 0)
    const hero =
      storefront.hero && inLang(storefront.hero)
        ? storefront.hero
        : (visibleBooks.find((b) => b.featured) ?? visibleBooks[0] ?? null)
    return { hero, rows }
  }, [storefront, languageFilter, visibleBooks])

  // Group the catalog into Speechify-style shelves by category. (Featured books
  // are surfaced separately via the storefront's "Editor's Picks" row.)
  const shelves = useMemo(() => {
    const byCategory = new Map<string, Book[]>()
    for (const b of visibleBooks) {
      const list = byCategory.get(b.category) ?? []
      list.push(b)
      byCategory.set(b.category, list)
    }
    const result: Array<{ title: string; books: Book[] }> = []
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
      // Cap each browse shelf: it's a horizontal scroller, so mounting every
      // book in a large category (hundreds of cards, each with images + cart
      // hooks) is wasted work. The true per-genre total is still shown in the
      // Genres nav, and the full set stays reachable via search/language.
      result.push({
        title: category,
        books: byCategory.get(category)!.slice(0, SHELF_BROWSE_CAP),
      })
    }
    return result
  }, [visibleBooks])

  // Total published books per category across the ENTIRE catalog (every
  // language), independent of the active language filter. The Genres nav shows
  // these true catalog totals so the numbers reflect the real store size rather
  // than just the English (or currently-filtered) subset.
  const catalogCountByCategory = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of books) {
      if (!b.category) continue
      counts.set(b.category, (counts.get(b.category) ?? 0) + 1)
    }
    return counts
  }, [books])

  const favoriteBooks = useMemo(
    () => books.filter((b) => favorites.has(b.id)),
    [books, favorites],
  )

  const [showFavorites, setShowFavorites] = useState(false)

  // Live catalog search (debounced).
  const [query, setQuery] = useState("")
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 400)
    return () => clearTimeout(id)
  }, [query])
  const searching = debounced.length > 0

  // Native-store search: match the query against our own catalog (all
  // languages) so books we actually carry surface first, before falling back to
  // external/Amazon results. Ranked by relevance: title prefix > title match >
  // author match, with featured titles nudged up. Capped so the section stays
  // focused.
  const nativeMatches = useMemo(() => {
    if (debounced.length < 2) return [] as Book[]
    const q = debounced.toLowerCase()
    const tokens = q.split(/\s+/).filter(Boolean)
    return books
      .map((b) => {
        const title = b.title.toLowerCase()
        const author = (b.author || "").toLowerCase()
        const hay = `${title} ${author}`
        if (!tokens.every((t) => hay.includes(t))) return null
        let score = 0
        if (title.startsWith(q)) score += 100
        else if (title.includes(q)) score += 50
        if (author.includes(q)) score += 10
        if (b.featured) score += 1
        return { book: b, score }
      })
      .filter((x): x is { book: Book; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18)
      .map((x) => x.book)
  }, [books, debounced])

  // Smart autocomplete: fetch title/author suggestions as the user types.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestOpen, setSuggestOpen] = useState(false)
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/store/suggest?q=${encodeURIComponent(q)}`,
        )
        const data = (await res.json()) as { suggestions?: Suggestion[] }
        if (!cancelled) setSuggestions(data.suggestions ?? [])
      } catch {
        if (!cancelled) setSuggestions([])
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [query])

  // Native-catalog typeahead: match our own books against the live query so
  // titles we actually carry appear at the TOP of the dropdown, before the
  // remote (Open Library / Amazon) suggestions.
  const nativeSuggestions = useMemo<MergedSuggestion[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const tokens = q.split(/\s+/).filter(Boolean)
    return books
      .map((b) => {
        const title = b.title.toLowerCase()
        const author = (b.author || "").toLowerCase()
        const hay = `${title} ${author}`
        if (!tokens.every((t) => hay.includes(t))) return null
        let score = 0
        if (title.startsWith(q)) score += 100
        else if (title.includes(q)) score += 50
        if (author.includes(q)) score += 10
        if (b.featured) score += 1
        return { b, score }
      })
      .filter((x): x is { b: Book; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(({ b }) => ({
        title: b.title,
        author: b.author || "Unknown",
        coverUrl: b.coverImageUrl ?? null,
        listenable: true,
        native: true as const,
      }))
  }, [books, query])

  // Native suggestions first, then remote suggestions with any duplicate
  // title/author pairs removed, capped so the dropdown stays compact.
  const mergedSuggestions = useMemo<MergedSuggestion[]>(() => {
    const seen = new Set(
      nativeSuggestions.map(
        (s) => `${s.title.toLowerCase()}|${s.author.toLowerCase()}`,
      ),
    )
    const remote = suggestions
      .filter(
        (s) => !seen.has(`${s.title.toLowerCase()}|${s.author.toLowerCase()}`),
      )
      .map((s) => ({ ...s, native: false }))
    return [...nativeSuggestions, ...remote].slice(0, 7)
  }, [nativeSuggestions, suggestions])

  function pickSuggestion(s: Suggestion) {
    const value = `${s.title} ${s.author}`.trim()
    setQuery(value)
    setDebounced(value)
    setSuggestOpen(false)
  }

  return (
    <div className="space-y-7">
      <CartReturnHandler />

      {/* Modern store header: title, cart, prominent always-on search, chips */}
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">Book Store</h1>
            <p className="text-sm text-muted-foreground text-pretty">
              Search and listen to millions of books.
            </p>
          </div>
          {!isIOS && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Open cart, ${count} item${count === 1 ? "" : "s"}`}
              className="relative flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary"
            >
              <ShoppingBag className="h-4 w-4 text-primary" />
              {count > 0 ? formatPrice(totalCents) : "$0"}
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
                  {count}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Prominent, always-visible search bar */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSuggestOpen(true)
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSuggestOpen(false)
            }}
            placeholder="Search by title or author…"
            aria-label="Search the book store"
            role="combobox"
            aria-expanded={suggestOpen && mergedSuggestions.length > 0}
            aria-autocomplete="list"
            className="h-14 w-full rounded-2xl border border-transparent bg-secondary pl-12 pr-11 text-base font-medium outline-none ring-primary/40 transition placeholder:font-normal placeholder:text-muted-foreground focus:border-primary/30 focus:bg-card focus:ring-2"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("")
                setSuggestions([])
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Autocomplete suggestions — native catalog titles first */}
          {suggestOpen && mergedSuggestions.length > 0 && (
            <ul className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
              {mergedSuggestions.map((s, i) => (
                <li key={`${s.title}-${i}`}>
                  <button
                    type="button"
                    // onMouseDown so it fires before the input's onBlur.
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickSuggestion(s)
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-secondary"
                  >
                    {s.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={s.coverUrl || "/placeholder.svg"}
                        alt=""
                        aria-hidden
                        className="h-10 w-7 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-7 shrink-0 items-center justify-center rounded bg-secondary">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {s.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.author}
                      </span>
                    </span>
                    {s.native ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        <BookOpen className="h-3 w-3" />
                        In library
                      </span>
                    ) : (
                      s.listenable && (
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                          <Headphones className="h-3 w-3" />
                          Listen
                        </span>
                      )
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Filter chips: personalize + favorites + language */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/discover"
            aria-label="Personalize your book recommendations"
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              personalized
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            <Sparkles className="h-4 w-4" />
            For You
          </Link>
          <button
            type="button"
            onClick={() => setShowFavorites((s) => !s)}
            aria-label="Show favorites"
            aria-pressed={showFavorites}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              showFavorites
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-secondary",
            )}
          >
            <Heart className={cn("h-4 w-4", showFavorites && "fill-current")} />
            Favorites
          </button>

          {/* Language picker — English by default. Other languages are only
              revealed on demand, via search, inside this popover. */}
          {languages.length > 1 && (
            <LanguageFilterMenu
              languages={languages}
              value={languageFilter}
              onChange={setLanguageFilter}
            />
          )}
        </div>
      </header>

      {searching ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Results for &ldquo;{debounced}&rdquo;
            {languageFilter !== "all" && languageFilter !== "en" && (
              <span className="ml-2 text-sm font-medium text-muted-foreground">
                in {languageLabel(languageFilter)}
              </span>
            )}
          </h2>

          {/* Native store matches first — books we actually carry, ready to
              listen or buy in-app. */}
          {nativeMatches.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
                <BookOpen className="h-4 w-4 text-primary" />
                In our library
                <span className="text-sm font-medium text-muted-foreground">
                  {nativeMatches.length}
                </span>
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
                {nativeMatches.map((book) => (
                  <StoreBookCard
                    key={book.id}
                    book={book}
                    owned={owned.has(book.id)}
                    favorited={favorites.has(book.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* External results (Amazon / Open Library) as a fallback for
              anything not in our own catalog. */}
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
              <ShoppingBag className="h-4 w-4 text-muted-foreground" />
              {nativeMatches.length > 0 ? "More from Amazon" : "From Amazon"}
            </h3>
            <LiveBookResults query={debounced} language={languageFilter} />
          </div>
        </section>
      ) : showFavorites ? (
        <FavoritesView
          favoriteBooks={favoriteBooks}
          owned={owned}
          favorites={favorites}
        />
      ) : (
        <>
          {/* Hero + curated rows are cross-language spotlights, so they only
              show when no specific language is selected. */}
          {!filteringLanguage && localizedStorefront?.hero && (
            <BookHero
              book={localizedStorefront.hero}
              owned={owned.has(localizedStorefront.hero.id)}
              favorited={favorites.has(localizedStorefront.hero.id)}
            />
          )}

          {!filteringLanguage &&
            localizedStorefront?.rows.map((row) => (
              <BookShelf
                key={row.key}
                title={row.title}
                books={row.books}
                owned={owned}
                favorites={favorites}
              />
            ))}

          {/* When a language is selected, lead with a clear heading. */}
          {filteringLanguage && (
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-bold tracking-tight">
                {`Books in ${languageLabel(languageFilter)}`}
                <span className="ml-2 text-sm font-medium text-muted-foreground">
                  {visibleBooks.length}
                </span>
              </h2>
            </div>
          )}

          {/* Upload your own books (free to listen) */}
          {!filteringLanguage && (
            <section>
              <UploadBook />
            </section>
          )}

          {/* Your uploaded books */}
          {!filteringLanguage && uploads.length > 0 && (
            <UploadsShelf uploads={uploads} />
          )}

          {/* Browse by category (heading hidden when a language filter already
              provides the section heading above). */}
          {!filteringLanguage && shelves.length > 0 && (
            <h2 className="pt-2 text-xl font-bold tracking-tight">
              Browse by category
            </h2>
          )}
          {shelves.map((shelf, i) => {
            // The shelf shows a capped slice; when the genre has more titles
            // than are shown, offer a "See all" link into the full paginated
            // genre page. Use the catalog-wide total so the link appears even
            // when the current language view is small.
            const genreTotal =
              catalogCountByCategory.get(shelf.title) ?? shelf.books.length
            const hasMore = genreTotal > shelf.books.length
            return (
              <LazyShelf
                key={shelf.title}
                id={genreSlug(shelf.title)}
                // Render the first couple of shelves immediately; defer the rest
                // until they scroll near the viewport so the page paints fast.
                eager={i < 2}
                placeholderCount={Math.min(shelf.books.length, 6)}
              >
                <BookShelf
                  id={genreSlug(shelf.title)}
                  title={shelf.title}
                  books={shelf.books}
                  owned={owned}
                  favorites={favorites}
                  seeAllHref={
                    hasMore
                      ? `/app/books/genre/${genreSlug(shelf.title).replace(/^genre-/, "")}`
                      : undefined
                  }
                  seeAllLabel={`See all ${genreTotal.toLocaleString()}`}
                />
              </LazyShelf>
            )
          })}

          {/* Genre quick-nav for easy jumping between categories */}
          {shelves.length > 0 && (
            <GenreNav
              genres={shelves.map((s) => ({
                title: s.title,
                // Show the true catalog-wide total for the genre (all
                // languages), not just the currently-filtered subset, so the
                // numbers reflect the real store size.
                count: catalogCountByCategory.get(s.title) ?? s.books.length,
              }))}
            />
          )}
        </>
      )}
    </div>
  )
}

// Maps each catalog category to a representative icon for the genre nav.
const GENRE_ICONS: Record<string, LucideIcon> = {
  "Mystery & Detective": Search,
  "Science Fiction": Rocket,
  Fantasy: Sparkles,
  Horror: Ghost,
  Adventure: Compass,
  "Historical Fiction": ScrollText,
  Romance: Heart,
  "Thriller & Suspense": Zap,
  "Short Stories": BookOpen,
  Classics: Crown,
  Fiction: BookOpen,
  Poetry: Feather,
  "Drama & Plays": Drama,
  "Humor & Satire": Laugh,
  "Biography & Memoir": UserRound,
  History: Landmark,
  Philosophy: Brain,
  Psychology: Brain,
  Politics: Scale,
  "Religion & Spirituality": Church,
  Science: FlaskConical,
  Mathematics: Calculator,
  Economics: TrendingUp,
  "Self-Help": Sparkles,
  Travel: Plane,
  "Nature & Environment": Leaf,
  "Children's Fiction": Blocks,
  "Fairy Tales": Castle,
}

function GenreNav({
  genres,
}: {
  genres: Array<{ title: string; count: number }>
}) {
  return (
    <section aria-labelledby="genres-heading" className="pt-4">
      <h2 id="genres-heading" className="mb-3 text-xl font-bold tracking-tight">
        Genres
      </h2>
      <ul className="flex flex-col gap-2.5">
        {genres.map((g) => {
          const Icon = GENRE_ICONS[g.title] ?? BookOpen
          return (
            <li key={g.title}>
              <Link
                href={`/app/books/genre/${genreSlug(g.title).replace(/^genre-/, "")}`}
                className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-4 transition-colors hover:bg-secondary/70"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {g.title}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {g.count} {g.count === 1 ? "book" : "books"}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Compact, search-on-demand language picker. Shows the current language (English
// by default) as a single control; other languages are only revealed when the
// user opens the popover and searches — never as a long list of chips upfront.
function LanguageFilterMenu({
  languages,
  value,
  onChange,
}: {
  languages: Array<{ code: string; count: number }>
  value: string
  onChange: (code: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const options = useMemo(() => {
    const all: Array<{ code: string; label: string; count: number | null }> = [
      { code: "all", label: "All languages", count: null },
      ...languages.map((l) => ({
        code: l.code,
        label: languageLabel(l.code),
        count: l.count,
      })),
    ]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.code.toLowerCase().includes(q),
    )
  }, [languages, query])

  const activeLabel = value === "all" ? "All languages" : languageLabel(value)
  const isDefault = value === "en"

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={`Language: ${activeLabel}. Change language`}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
              isDefault
                ? "border-border bg-card hover:bg-secondary"
                : "border-primary bg-primary text-primary-foreground",
            )}
          />
        }
      >
        <Globe className="h-4 w-4" />
        <span className="max-w-[7rem] truncate">{activeLabel}</span>
        <ChevronRight className="h-3.5 w-3.5 rotate-90 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search languages…"
              className="h-9 pl-8"
            />
          </div>
        </div>
        <ul className="max-h-64 overflow-y-auto p-1">
          {options.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No languages found
            </li>
          ) : (
            options.map((o) => {
              const active = o.code === value
              return (
                <li key={o.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.code)
                      setOpen(false)
                      setQuery("")
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      active
                        ? "bg-secondary font-semibold"
                        : "hover:bg-secondary/60",
                    )}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.count != null && (
                      <span className="text-xs text-muted-foreground">
                        {o.count}
                      </span>
                    )}
                    {active && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function BookHero({
  book,
  owned,
  favorited,
}: {
  book: Book
  owned: boolean
  favorited: boolean
}) {
  const { has, add, remove } = useCart()
  const { isIOS } = usePlatform()
  const inCart = has(book.id)
  const isAffiliate = book.fulfillment === "affiliate"
  // Apple Guideline 3.1.1: no native purchase surface inside the iOS app.
  const gateNative = isIOS && !owned && !isAffiliate

  return (
    <section
      aria-label="Featured book"
      className="overflow-hidden rounded-3xl border border-border"
      // Subtle tint drawn from the book's own cover color as an accent.
      style={{ backgroundColor: `${book.coverColor}14` }}
    >
      <div className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:items-center sm:gap-7 sm:p-8 sm:text-left">
        <Link
          href={`/app/books/${book.id}`}
          aria-label={book.title}
          className="w-32 shrink-0 sm:w-40"
        >
          <BookCover
            book={book}
            className="w-full shadow-lg transition-transform hover:-translate-y-1"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Featured
          </span>
          <h2 className="mt-3 text-pretty text-2xl font-bold tracking-tight sm:text-3xl">
            {book.title}
          </h2>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            by {book.author}
          </p>
          {book.description && (
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground text-pretty sm:line-clamp-3">
              {book.description}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
            {owned ? (
              <Link
                href={`/app/listen/book/${book.id}`}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Headphones className="h-4 w-4" />
                Listen now
              </Link>
            ) : isAffiliate ? (
              <Link
                href={`/app/books/${book.id}`}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Headphones className="h-4 w-4" />
                Listen to sample
              </Link>
            ) : gateNative ? (
              <span className="flex h-11 items-center gap-2 rounded-full bg-secondary/60 px-6 text-sm font-semibold text-muted-foreground">
                Available on voxyfi.com
              </span>
            ) : inCart ? (
              <button
                type="button"
                onClick={() => remove(book.id)}
                className="flex h-11 items-center gap-2 rounded-full border border-primary bg-primary/10 px-6 text-sm font-semibold text-primary transition-colors"
              >
                <Check className="h-4 w-4" />
                In cart
              </button>
            ) : (
              <button
                type="button"
                onClick={() => add(toCartItem(book))}
                className="flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" />
                Add · {formatPrice(book.priceInCents)}
              </button>
            )}
            <Link
              href={`/app/books/${book.id}`}
              className="flex h-11 items-center gap-1.5 rounded-full border border-border bg-card px-5 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              Details
              <ArrowRight className="h-4 w-4" />
            </Link>
            <FavoriteButton
              bookId={book.id}
              initialFavorited={favorited}
              size="md"
              className="h-11 w-11 border border-border bg-card"
            />
          </div>
        </div>
      </div>
    </section>
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

/**
 * Defers rendering of a heavy shelf (many cover images) until it scrolls near
 * the viewport. Until then it shows a light skeleton of the same height, so the
 * page paints quickly and anchor jumps (#genre-…) still land in roughly the
 * right place. `eager` shelves render immediately.
 */
function LazyShelf({
  id,
  eager = false,
  placeholderCount,
  children,
}: {
  id?: string
  eager?: boolean
  placeholderCount: number
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)

  // Mount instantly if the URL already targets this shelf's anchor (e.g. the
  // user tapped a genre link that points here).
  useEffect(() => {
    if (!visible && id && window.location.hash === `#${id}`) setVisible(true)
  }, [id, visible])

  useEffect(() => {
    if (visible) return
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      // Start loading a good bit before it enters view for a seamless scroll.
      { rootMargin: "600px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  if (visible) return <>{children}</>

  // Keep the anchor id on the placeholder so #genre-… jumps always land, even
  // before the real shelf mounts.
  return (
    <section ref={ref} id={id} aria-hidden className={id ? "scroll-mt-6" : undefined}>
      <div className="mb-3 h-6 w-40 animate-pulse rounded bg-secondary" />
      <div className="-mx-4 flex gap-4 overflow-hidden px-4 pb-2 sm:-mx-6 sm:px-6">
        {Array.from({ length: placeholderCount }).map((_, i) => (
          <div key={i} className="w-32 shrink-0 sm:w-36">
            <div className="aspect-[2/3] w-full animate-pulse rounded-lg bg-secondary" />
          </div>
        ))}
      </div>
    </section>
  )
}

function BookShelf({
  id,
  title,
  books,
  owned,
  favorites,
  seeAllHref,
  seeAllLabel,
}: {
  id?: string
  title: string
  books: Book[]
  owned: Set<number>
  favorites: Set<number>
  // When set, a "See all" link is shown that opens the full paginated genre.
  seeAllHref?: string
  seeAllLabel?: string
}) {
  return (
    <section id={id} className={id ? "scroll-mt-6" : undefined}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
          >
            {seeAllLabel ?? "See all"}
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
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
  const { isIOS } = usePlatform()
  const inCart = has(book.id)
  const isAffiliate = book.fulfillment === "affiliate"
  // Apple Guideline 3.1.1: no price/purchase surface for native titles on iOS.
  const gateNative = isIOS && !owned && !isAffiliate

  const badge: BookCardBadge = owned
    ? { kind: "owned" }
    : isAffiliate
      ? { kind: "sample" }
      : gateNative
        ? null
        : { kind: "price", priceInCents: book.priceInCents }

  const action: BookCardAction = owned
    ? { kind: "listen", href: `/app/listen/book/${book.id}` }
    : isAffiliate
      ? { kind: "sample", href: `/app/books/${book.id}` }
      : gateNative
        ? { kind: "web-only" }
        : {
            kind: "add",
            priceInCents: book.priceInCents,
            inCart,
            onAdd: () => add(toCartItem(book)),
            onRemove: () => remove(book.id),
          }

  return (
    <StoreCard
      cover={book}
      title={book.title}
      author={book.author}
      language={book.language}
      href={`/app/books/${book.id}`}
      badge={badge}
      favorite={
        <FavoriteButton
          bookId={book.id}
          initialFavorited={favorited}
          size="sm"
          className="h-8 w-8 bg-card/90 shadow-sm backdrop-blur hover:bg-card"
        />
      }
      action={action}
    />
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
          const accent = UPLOAD_COLORS[i % UPLOAD_COLORS.length]
          const mime = doc.originalMime ?? ""
          const isImage = mime.startsWith("image/") && !!doc.originalUrl
          const ext = (doc.title.split(".").pop() ?? "").toUpperCase()
          const fileType = mime.includes("pdf")
            ? "PDF"
            : /word|officedocument|docx/.test(mime)
              ? "DOCX"
              : mime.includes("epub")
                ? "EPUB"
                : ext && ext.length >= 2 && ext.length <= 4
                  ? ext
                  : "DOC"
          // A short first-page snippet, whitespace-normalized, so the cover
          // shows the real beginning of the document.
          const preview = doc.content.replace(/\s+/g, " ").trim().slice(0, 240)
          // Drop a trailing file extension from the on-cover title for a
          // cleaner "cover" look.
          const displayTitle = doc.title.replace(/\.[a-z0-9]{2,4}$/i, "")
          return (
            <Link
              key={doc.id}
              href={`/app/listen/${doc.id}`}
              className="group flex w-32 shrink-0 flex-col gap-2 sm:w-36"
            >
              <div className="relative">
                {isImage ? (
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg shadow-md transition-transform group-hover:-translate-y-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={doc.originalUrl as string}
                      alt={`Cover of ${displayTitle}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="relative flex aspect-[2/3] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-md transition-transform group-hover:-translate-y-1">
                    <div
                      className="h-1.5 w-full shrink-0"
                      style={{ backgroundColor: accent }}
                      aria-hidden
                    />
                    <div className="flex flex-1 flex-col gap-1.5 p-3">
                      <span className="inline-flex w-fit items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        <FileText className="h-3 w-3" aria-hidden />
                        {fileType}
                      </span>
                      <p className="line-clamp-3 text-pretty text-[0.82rem] font-bold leading-tight text-foreground">
                        {displayTitle}
                      </p>
                      {preview && (
                        <p
                          className="overflow-hidden text-[0.6rem] leading-relaxed text-muted-foreground"
                          style={{
                            display: "-webkit-box",
                            WebkitBoxOrient: "vertical",
                            WebkitLineClamp: 6,
                          }}
                        >
                          {preview}
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <span className="absolute right-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm">
                  Free
                </span>
              </div>
              <div>
                <p className="truncate text-sm font-semibold">{displayTitle}</p>
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
