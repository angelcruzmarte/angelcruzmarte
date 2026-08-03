"use server"

import { db } from "@/lib/db"
import { book, bookFavorite, bookPurchase, bookRating } from "@/lib/db/schema"
import { recordBookEvent } from "@/lib/book-analytics"
import { fetchAndParseGutenberg } from "@/lib/gutenberg"
import {
  dedupeKey,
  deriveDescription,
  normalizeAuthor,
  normalizeTitle,
  scoreBook,
  verifyLanguage,
} from "@/lib/book-quality"
import { resolveRealCover } from "@/lib/book-covers"
import { INTEREST_LABELS } from "@/lib/interests"
import { getCurrentUser, getUserId } from "@/lib/session"
import { stripe } from "@/lib/stripe"
import { getBaseUrl } from "@/lib/urls"
import { and, count, desc, eq, gte, inArray, ne, notInArray, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getMyInterests } from "./interests"
import { MIN_RATINGS_TO_SHOW, type BookRatingSummary } from "@/lib/ratings"
import type { BookCard } from "@/lib/db/schema"

// Columns needed to render book cards / the storefront — everything except the
// heavy full-text `content`, which would bloat the store payload enormously.
const bookCardColumns = {
  id: book.id,
  title: book.title,
  author: book.author,
  category: book.category,
  language: book.language,
  description: book.description,
  excerpt: book.excerpt,
  priceInCents: book.priceInCents,
  fulfillment: book.fulfillment,
  isbn: book.isbn,
  buyUrl: book.buyUrl,
  coverImageUrl: book.coverImageUrl,
  gutenbergId: book.gutenbergId,
  coverColor: book.coverColor,
  accentColor: book.accentColor,
  featured: book.featured,
  published: book.published,
  createdAt: book.createdAt,
}

// Flat price for public-domain books imported on-demand from the live catalog.
const IMPORTED_BOOK_PRICE = 499

// Cover colors used when an imported book has no artwork.
const IMPORT_PALETTE: Array<[string, string]> = [
  ["#2f3e9e", "#f4b740"],
  ["#7c2d12", "#fbbf24"],
  ["#134e4a", "#5eead4"],
  ["#4c1d95", "#f0abfc"],
  ["#831843", "#fda4af"],
  ["#1e3a5f", "#7dd3fc"],
]

export async function getBooks(): Promise<BookCard[]> {
  return db
    .select(bookCardColumns)
    .from(book)
    // Only surface published titles in the public store. Admins can toggle
    // visibility without deleting the catalog row.
    .where(eq(book.published, true))
    .orderBy(desc(book.featured), desc(book.createdAt))
}

export async function getBook(id: number) {
  const [row] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  return row ?? null
}

export type StorefrontRow = { key: string; title: string; books: BookCard[] }

export type Storefront = {
  hero: BookCard | null
  rows: StorefrontRow[]
}

// How many books to show per curated storefront row.
const ROW_SIZE = 12

// Deterministic hourly rotation offset in [0, len). Keeps a large row stable
// within the hour while advancing each hour so repeat visits feel fresh.
const HOUR_MS = 60 * 60 * 1000
function bucketOffset(len: number): number {
  if (len <= 0) return 0
  return Math.floor(Date.now() / HOUR_MS) % len
}

/**
 * Build a language-aware candidate pool from a semantically ordered list
 * (e.g. newest-first, or rotated classics). Keeps up to `perLang` books for
 * each language — English first, then other languages by how well represented
 * they are — while preserving the incoming order within each language.
 *
 * Why: rows used to be sliced to a single ROW_SIZE window from the full
 * cross-language catalog. When the newest / first books skewed to one language
 * (e.g. a batch of Chinese Gutenberg imports), the English storefront filtered
 * those rows to empty and dropped them entirely. Pooling per language
 * guarantees the English view (and the All view, which leads English) can
 * always fill a shelf. The client still slices each row to ROW_SIZE after
 * applying the active language filter.
 */
function languageAwarePool(ordered: BookCard[], perLang = ROW_SIZE): BookCard[] {
  const byLang = new Map<string, BookCard[]>()
  for (const b of ordered) {
    const code = b.language || "en"
    const list = byLang.get(code) ?? []
    if (list.length < perLang) {
      list.push(b)
      byLang.set(code, list)
    }
  }
  const langs = Array.from(byLang.keys()).sort((a, b) => {
    if (a === "en") return -1
    if (b === "en") return 1
    return byLang.get(b)!.length - byLang.get(a)!.length
  })
  return langs.flatMap((code) => byLang.get(code)!)
}

/**
 * Builds the storefront: a hero spotlight plus curated rows. "New Releases"
 * and "Editor's Picks" are derived from catalog metadata; "Trending" (last 30
 * days) and "Best Sellers" (all-time) are derived from real purchase counts,
 * so they only appear once there is genuine sales data.
 *
 * Takes the already-fetched catalog so the books page only queries the catalog
 * once (this used to run its own `getBooks()`, duplicating a ~400-row fetch).
 */
async function buildStorefront(all: BookCard[]): Promise<Storefront> {
  if (all.length === 0) return { hero: null, rows: [] }

  const byId = new Map(all.map((b) => [b.id, b]))
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Real purchase counts, all-time and trailing 30 days.
  const [allTime, recent] = await Promise.all([
    db
      .select({ bookId: bookPurchase.bookId, c: count() })
      .from(bookPurchase)
      .groupBy(bookPurchase.bookId)
      .orderBy(desc(count())),
    db
      .select({ bookId: bookPurchase.bookId, c: count() })
      .from(bookPurchase)
      .where(gte(bookPurchase.createdAt, thirtyDaysAgo))
      .groupBy(bookPurchase.bookId)
      .orderBy(desc(count())),
  ])

  // Each row keeps a language-aware pool (up to ROW_SIZE books per language,
  // English first); the client slices to ROW_SIZE after applying the active
  // language filter, so the English store always fills.
  const rankToBooks = (ranked: { bookId: number }[]) =>
    languageAwarePool(
      ranked
        .map((r) => byId.get(r.bookId))
        .filter((b): b is BookCard => Boolean(b)),
    )

  const rows: StorefrontRow[] = []

  // Editor's Picks — curated featured titles.
  const editors = languageAwarePool(all.filter((b) => b.featured))
  if (editors.length > 0) {
    rows.push({ key: "editors", title: "Editor's Picks", books: editors })
  }

  // New Releases — newest additions to the catalog.
  const newReleases = languageAwarePool(
    [...all].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  )
  if (newReleases.length > 0) {
    rows.push({ key: "new", title: "New Releases", books: newReleases })
  }

  // Trending — most purchased in the last 30 days (only with real data).
  const trending = rankToBooks(recent)
  if (trending.length >= 3) {
    rows.push({ key: "trending", title: "Trending Now", books: trending })
  }

  // Best Sellers — most purchased all-time (only with real data).
  const bestSellers = rankToBooks(allTime)
  if (bestSellers.length >= 3) {
    rows.push({ key: "bestsellers", title: "Best Sellers", books: bestSellers })
  }

  // Classic Literature — public-domain titles (sourced from Project Gutenberg),
  // read and listened to directly in VOXYFI. Rotated by the hourly bucket so the
  // row stays fresh on repeat visits rather than always showing the same slice.
  // NB: these are paid in-app titles, so we do NOT label them "free".
  const classics = all.filter((b) => b.gutenbergId != null)
  if (classics.length >= 3) {
    const start = classics.length > ROW_SIZE ? bucketOffset(classics.length) : 0
    const rotated = [...classics.slice(start), ...classics.slice(0, start)]
    rows.push({
      key: "classics",
      title: "Classic Literature",
      books: languageAwarePool(rotated),
    })
  }

  // Hero: rotate the Featured pick hourly so the spotlight stays fresh on
  // repeat visits. The rotation pool prioritizes curated featured titles, then
  // fills with new releases and best sellers (deduped) so there's always more
  // than one book to cycle through even if only a few are flagged featured.
  const heroPool: BookCard[] = []
  const seen = new Set<number>()
  for (const b of [...editors, ...newReleases, ...bestSellers]) {
    if (!seen.has(b.id)) {
      seen.add(b.id)
      heroPool.push(b)
    }
  }
  if (heroPool.length === 0 && all.length > 0) heroPool.push(all[0])

  // Spotlight a different book on each visit so the featured hero visibly
  // alternates rather than appearing stuck on one title. The page is
  // dynamically rendered per request, so a random pick is chosen server-side
  // and passed to the client (no hydration mismatch).
  //
  // Scope the rotation to English candidates: the store defaults to the English
  // view, and the client only renders `storefront.hero` directly when it
  // matches the active language (otherwise it falls back to a fixed "first
  // featured" title). Picking a non-English hero would therefore always be
  // discarded and make the spotlight look stuck. Fall back to the full pool
  // only if there are no English candidates.
  const englishPool = heroPool.filter((b) => (b.language || "en") === "en")
  const rotationPool = englishPool.length > 0 ? englishPool : heroPool
  const hero =
    rotationPool.length > 0
      ? rotationPool[Math.floor(Math.random() * rotationPool.length)]
      : null

  return { hero, rows }
}

/** Returns the set of book ids the current user owns (empty if signed out). */
export async function getOwnedBookIds(): Promise<Set<number>> {
  const user = await getCurrentUser()
  if (!user) return new Set()
  const rows = await db
    .select({ bookId: bookPurchase.bookId })
    .from(bookPurchase)
    .where(eq(bookPurchase.userId, user.id))
  return new Set(rows.map((r) => r.bookId))
}

/** True if the current user owns the given book. */
export async function ownsBook(bookId: number): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  const [row] = await db
    .select({ id: bookPurchase.id })
    .from(bookPurchase)
    .where(
      and(eq(bookPurchase.userId, user.id), eq(bookPurchase.bookId, bookId)),
    )
    .limit(1)
  return Boolean(row)
}

/** Returns the full book rows the current user has purchased, newest first. */
export async function getPurchasedBooks() {
  const user = await getCurrentUser()
  if (!user) return []
  const purchases = await db
    .select()
    .from(bookPurchase)
    .where(eq(bookPurchase.userId, user.id))
    .orderBy(desc(bookPurchase.createdAt))
  if (purchases.length === 0) return []
  const ids = purchases.map((p) => p.bookId)
  const books = await db.select().from(book).where(inArray(book.id, ids))
  const byId = new Map(books.map((b) => [b.id, b]))
  // Preserve purchase order and attach resume position.
  return purchases
    .map((p) => {
      const b = byId.get(p.bookId)
      return b ? { ...b, lastWord: p.lastWord, purchasedAt: p.createdAt } : null
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
}

/**
 * Grants ownership of a book to a user (idempotent). Called from the Stripe
 * webhook and, as a fallback, after a successful checkout redirect.
 */
export async function grantBookPurchase(
  userId: string,
  bookId: number,
  stripeSessionId?: string,
) {
  const inserted = await db
    .insert(bookPurchase)
    .values({ userId, bookId, stripeSessionId })
    .onConflictDoNothing({
      target: [bookPurchase.userId, bookPurchase.bookId],
    })
    .returning({ id: bookPurchase.id })

  // Only log revenue on the FIRST grant (onConflictDoNothing returns no rows on
  // a duplicate) and only for genuinely paid titles — free public-domain adds
  // go through this same path at price 0 and must not count as revenue.
  if (inserted.length > 0) {
    const [b] = await db
      .select({
        title: book.title,
        author: book.author,
        priceInCents: book.priceInCents,
      })
      .from(book)
      .where(eq(book.id, bookId))
      .limit(1)

    if (b && b.priceInCents > 0) {
      await recordBookEvent({
        type: "native_purchase",
        bookId,
        bookTitle: b.title,
        author: b.author,
        provider: "voxyfi",
        amountCents: b.priceInCents,
        userId,
      })
    }
  }
}

type GutenbergMeta = {
  title?: string
  author?: string
  coverUrl?: string | null
  category?: string
}

/**
 * Imports a public-domain book from Project Gutenberg into our catalog on
 * demand (idempotent by gutenbergId). Downloads and stores the full text so it
 * can be read aloud once purchased. Returns the catalog book id, or null if
 * the text couldn't be fetched.
 */
export async function importGutenbergBook(
  gutenbergId: number,
  meta: GutenbergMeta = {},
): Promise<number | null> {
  if (!Number.isFinite(gutenbergId) || gutenbergId <= 0) return null

  // Reuse an existing catalog row if we've already imported this book.
  const [existing] = await db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.gutenbergId, gutenbergId))
    .limit(1)
  if (existing) return existing.id

  const parsed = await fetchAndParseGutenberg(gutenbergId)
  if (!parsed) return null

  const [color, accent] =
    IMPORT_PALETTE[gutenbergId % IMPORT_PALETTE.length]

  // Normalize metadata, rebuild a clean (boilerplate-free) description, detect
  // the true language from the text, and resolve real cover artwork instead of
  // a generic Gutenberg placeholder (null → the UI renders our branded card).
  const title = normalizeTitle(meta.title?.trim() || parsed.title)
  const author = normalizeAuthor(meta.author?.trim() || parsed.author)
  const derived = deriveDescription(parsed.body)
  const description = derived.description || parsed.description
  const excerpt = derived.excerpt || parsed.excerpt
  const sample = `${title} ${parsed.body.slice(0, 1200)}`
  const { language } = verifyLanguage("en", sample)
  const coverImageUrl = await resolveRealCover({ title, author })
  const category = meta.category?.trim() || "Classics"

  // Duplicate detection: a different catalog entry with the same normalized
  // title + author (a distinct Gutenberg edition of the same work).
  const key = dedupeKey(title, author)
  const titleMatches = await db
    .select({ id: book.id, title: book.title, author: book.author })
    .from(book)
    .where(and(sql`lower(${book.title}) = lower(${title})`, ne(book.gutenbergId, gutenbergId)))
    .limit(20)
  const duplicateOf =
    titleMatches.find((m) => dedupeKey(m.title, m.author) === key)?.id ?? null

  // Score the metadata; quarantine (unpublished + needs_review) on failure.
  const report = scoreBook({
    title,
    author,
    language,
    coverImageUrl,
    description,
    publicationYear: null,
    isbn: null,
    category,
    sample,
    fulfillment: "in_app",
    duplicateOf,
  })
  const publishable = report.verdict === "publish"

  const [inserted] = await db
    .insert(book)
    .values({
      title,
      author,
      category,
      language,
      description,
      excerpt,
      content: parsed.body,
      priceInCents: IMPORTED_BOOK_PRICE,
      coverImageUrl,
      gutenbergId,
      coverColor: color,
      accentColor: accent,
      published: publishable,
      availability: publishable ? "available" : "needs_review",
      qualityScore: report.score,
      qualityReport: report,
      qualityCheckedAt: new Date(),
    })
    .returning({ id: book.id })

  return inserted?.id ?? null
}

/**
 * Adds a public-domain (Project Gutenberg) book to the user's library for
 * free and grants ownership immediately, so they can listen right away with
 * no external purchase. Returns the catalog book id to open the player.
 */
export async function addGutenbergBook(
  gutenbergId: number,
  meta: GutenbergMeta = {},
) {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to add books." }

  const bookId = await importGutenbergBook(gutenbergId, meta)
  if (!bookId) {
    return { error: "Sorry, this book's text could not be loaded. Try another." }
  }

  await grantBookPurchase(user.id, bookId)
  revalidatePath("/app/library")
  return { bookId }
}

/**
 * Imports a live-catalog public-domain book (if needed) and starts checkout
 * for it. Used by the store's live search results.
 */
export async function createGutenbergCheckout(
  gutenbergId: number,
  meta: GutenbergMeta = {},
) {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to buy books." }

  const bookId = await importGutenbergBook(gutenbergId, meta)
  if (!bookId) {
    return { error: "Sorry, this book's text could not be loaded. Try another." }
  }
  return createBookCheckout(bookId)
}

/**
 * Starts a one-time Stripe Checkout payment for a single book. Price is read
 * from the catalog server-side so it can't be tampered with on the client.
 */
export async function createBookCheckout(bookId: number) {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to buy books." }

  const target = await getBook(bookId)
  if (!target) return { error: "Book not found." }

  // Guardrail: commercial (affiliate) titles are never sold through our Stripe
  // checkout — they're purchased on the partner store. The client should route
  // these to the affiliate buy link instead of calling this action.
  if (target.fulfillment === "affiliate") {
    return {
      error: "This title is sold on our partner bookstore, not in-app.",
    }
  }

  if (await ownsBook(bookId)) {
    // Already owned — send them straight to listening.
    return { url: `${getBaseUrl()}/app/listen/book/${bookId}` }
  }

  const baseUrl = getBaseUrl()
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: target.priceInCents,
          product_data: {
            name: target.title,
            description: `by ${target.author}`,
          },
        },
      },
    ],
    // Metadata is echoed back on the checkout.session.completed event so the
    // webhook can grant ownership to the right user + book.
    metadata: { userId: user.id, bookId: String(bookId), kind: "book" },
    payment_intent_data: {
      metadata: { userId: user.id, bookId: String(bookId), kind: "book" },
    },
    success_url: `${baseUrl}/app/books/${bookId}?purchased=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/app/books/${bookId}?canceled=1`,
  })

  if (!checkout.url) return { error: "Could not start checkout. Try again." }
  return { url: checkout.url }
}

/**
 * Fallback reconciliation after checkout: if Stripe reports the session as
 * paid, grant ownership. Safe to call repeatedly (grant is idempotent).
 */
export async function confirmBookCheckout(sessionId: string) {
  const user = await getCurrentUser()
  if (!user) return { owned: false }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid =
      session.payment_status === "paid" || session.status === "complete"
    const bookId = Number(session.metadata?.bookId)
    const belongsToUser = session.metadata?.userId === user.id
    if (paid && belongsToUser && Number.isFinite(bookId)) {
      await grantBookPurchase(user.id, bookId, sessionId)
      revalidatePath(`/app/books/${bookId}`)
      revalidatePath("/app/library")
      return { owned: true }
    }
  } catch (error) {
    console.error("[v0] confirmBookCheckout failed:", error)
  }
  return { owned: false }
}

/** Saves the resume position (word index) for a purchased book. */
export async function saveBookProgress(bookId: number, wordIndex: number) {
  const userId = await getUserId()
  await db
    .update(bookPurchase)
    .set({ lastWord: Math.max(0, Math.floor(wordIndex)) })
    .where(
      and(eq(bookPurchase.userId, userId), eq(bookPurchase.bookId, bookId)),
    )
}

/**
 * Builds the signed-in user's personalized storefront rows from real data:
 * Continue Reading (owned + in progress), Recommended For You (by saved
 * interests), and Because You Read {Title} (same category as the most recent
 * purchase). Returns [] for signed-out users or when there's no data, so the
 * store degrades gracefully to the curated rows. Reuses the already-fetched
 * catalog (`byId`) — no extra catalog query.
 */
async function buildPersonalizedRows(
  byId: Map<number, BookCard>,
  interestIds: string[],
  userId: string,
): Promise<StorefrontRow[]> {
  // The user's purchases: id, resume position, and recency.
  const purchases = await db
    .select({
      bookId: bookPurchase.bookId,
      lastWord: bookPurchase.lastWord,
      createdAt: bookPurchase.createdAt,
    })
    .from(bookPurchase)
    .where(eq(bookPurchase.userId, userId))
    .orderBy(desc(bookPurchase.createdAt))

  const ownedIds = new Set(purchases.map((p) => p.bookId))
  const rows: StorefrontRow[] = []

  // Continue Reading — owned titles the user has started (resume position > 0),
  // most recently purchased first.
  const continueReading = purchases
    .filter((p) => p.lastWord > 0)
    .map((p) => byId.get(p.bookId))
    .filter((b): b is BookCard => Boolean(b))
    .slice(0, ROW_SIZE)
  if (continueReading.length > 0) {
    rows.push({
      key: "continue",
      title: "Continue Reading",
      books: continueReading,
    })
  }

  // Recommended For You — catalog titles in the user's saved interest
  // categories that they don't already own, featured first.
  const wanted = new Set(
    interestIds.map((id) => (INTEREST_LABELS.get(id) ?? id).toLowerCase()),
  )
  if (wanted.size > 0) {
    const recommended = [...byId.values()]
      .filter((b) => wanted.has(b.category.toLowerCase()) && !ownedIds.has(b.id))
      .sort((a, b) => Number(b.featured) - Number(a.featured))
      .slice(0, ROW_SIZE)
    if (recommended.length >= 3) {
      rows.push({
        key: "recommended",
        title: "Recommended For You",
        books: recommended,
      })
    }
  }

  // Because You Read {Title} — same category as the user's most recent
  // purchase, excluding books they already own.
  const recent = purchases.map((p) => byId.get(p.bookId)).find(Boolean)
  if (recent) {
    const similar = [...byId.values()]
      .filter(
        (b) =>
          b.id !== recent.id &&
          !ownedIds.has(b.id) &&
          b.category.toLowerCase() === recent.category.toLowerCase(),
      )
      .slice(0, ROW_SIZE)
    if (similar.length >= 3) {
      rows.push({
        key: `because-${recent.id}`,
        title: `Because You Read ${recent.title}`,
        books: similar,
      })
    }
  }

  return rows
}

/**
 * Single entry point for the Book Store page. Fetches the catalog ONCE, then
 * derives the personalized ordering (by the user's interests), the personalized
 * discovery rows (Continue Reading / Recommended / Because You Read), and the
 * curated storefront (hero + rows) from it. This replaces two separate calls
 * that each re-queried the whole catalog.
 */
export async function getStorefrontData(): Promise<{
  books: BookCard[]
  personalized: boolean
  storefront: Storefront
}> {
  const [all, interestIds, user] = await Promise.all([
    getBooks(),
    getMyInterests().catch(() => [] as string[]),
    getCurrentUser(),
  ])
  const storefront = await buildStorefront(all)

  // Prepend the signed-in user's personalized rows so discovery leads with
  // their own reading journey, then the curated rows follow.
  if (user) {
    const byId = new Map(all.map((b) => [b.id, b]))
    const personalRows = await buildPersonalizedRows(byId, interestIds, user.id)
    if (personalRows.length > 0) {
      storefront.rows = [...personalRows, ...storefront.rows]
    }
  }

  const wanted = new Set(
    interestIds.map((id) => (INTEREST_LABELS.get(id) ?? id).toLowerCase()),
  )
  if (wanted.size === 0) {
    return { books: all, personalized: false, storefront }
  }

  const ranked = [...all].sort((a, b) => {
    const aMatch = wanted.has(a.category.toLowerCase()) ? 1 : 0
    const bMatch = wanted.has(b.category.toLowerCase()) ? 1 : 0
    if (aMatch !== bMatch) return bMatch - aMatch
    return Number(b.featured) - Number(a.featured)
  })
  return { books: ranked, personalized: true, storefront }
}

// ----- Favorites (wishlist) -----

/** Returns the set of book ids the current user has favorited. */
export async function getFavoriteBookIds(): Promise<Set<number>> {
  const user = await getCurrentUser()
  if (!user) return new Set()
  const rows = await db
    .select({ bookId: bookFavorite.bookId })
    .from(bookFavorite)
    .where(eq(bookFavorite.userId, user.id))
  return new Set(rows.map((r) => r.bookId))
}

/** Full favorited book rows for the current user, newest first. */
export async function getFavoriteBooks() {
  const user = await getCurrentUser()
  if (!user) return []
  const favs = await db
    .select()
    .from(bookFavorite)
    .where(eq(bookFavorite.userId, user.id))
    .orderBy(desc(bookFavorite.createdAt))
  if (favs.length === 0) return []
  const ids = favs.map((f) => f.bookId)
  const books = await db.select().from(book).where(inArray(book.id, ids))
  const byId = new Map(books.map((b) => [b.id, b]))
  return favs
    .map((f) => byId.get(f.bookId))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
}

/** True if the current user has favorited the given book. */
export async function isBookFavorited(bookId: number): Promise<boolean> {
  const user = await getCurrentUser()
  if (!user) return false
  const [row] = await db
    .select({ id: bookFavorite.id })
    .from(bookFavorite)
    .where(
      and(
        eq(bookFavorite.userId, user.id),
        eq(bookFavorite.bookId, bookId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/** Adds or removes a book from the user's favorites. Returns the new state. */
export async function toggleFavorite(bookId: number) {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to save favorites." }

  const [existing] = await db
    .select({ id: bookFavorite.id })
    .from(bookFavorite)
    .where(
      and(
        eq(bookFavorite.userId, user.id),
        eq(bookFavorite.bookId, bookId),
      ),
    )
    .limit(1)

  if (existing) {
    await db.delete(bookFavorite).where(eq(bookFavorite.id, existing.id))
    revalidatePath("/app/books")
    return { favorited: false }
  }

  await db
    .insert(bookFavorite)
    .values({ userId: user.id, bookId })
    .onConflictDoNothing({
      target: [bookFavorite.userId, bookFavorite.bookId],
    })
  revalidatePath("/app/books")
  return { favorited: true }
}

// ----- Multi-book cart checkout -----

/**
 * Starts a single Stripe Checkout for multiple books at once. Prices are read
 * from the catalog server-side; books the user already owns are skipped.
 */
export async function createCartCheckout(bookIds: number[]) {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to buy books." }

  const uniqueIds = Array.from(
    new Set(bookIds.filter((n) => Number.isFinite(n) && n > 0)),
  )
  if (uniqueIds.length === 0) return { error: "Your cart is empty." }

  const rows = await db.select().from(book).where(inArray(book.id, uniqueIds))
  const ownedIds = await getOwnedBookIds()
  // Skip already-owned titles AND affiliate titles (which are never charged
  // in-app — they're bought on the partner store).
  const toBuy = rows.filter(
    (b) => !ownedIds.has(b.id) && b.fulfillment !== "affiliate",
  )

  if (toBuy.length === 0) {
    // Everything in the cart is already owned — nothing to charge.
    return { url: `${getBaseUrl()}/app/library`, alreadyOwned: true }
  }

  const baseUrl = getBaseUrl()
  const idsCsv = toBuy.map((b) => b.id).join(",")
  const checkout = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email,
    line_items: toBuy.map((b) => ({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: b.priceInCents,
        product_data: { name: b.title, description: `by ${b.author}` },
      },
    })),
    metadata: { userId: user.id, bookIds: idsCsv, kind: "book-cart" },
    payment_intent_data: {
      metadata: { userId: user.id, bookIds: idsCsv, kind: "book-cart" },
    },
    success_url: `${baseUrl}/app/books?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/app/books?checkout=canceled`,
  })

  if (!checkout.url) return { error: "Could not start checkout. Try again." }
  return { url: checkout.url }
}

/**
 * Grants ownership of every book in a paid cart session (idempotent). Called
 * from the webhook and, as a fallback, after the success redirect.
 */
export async function grantCartPurchase(
  userId: string,
  bookIds: number[],
  stripeSessionId?: string,
) {
  for (const bookId of bookIds) {
    if (Number.isFinite(bookId) && bookId > 0) {
      await grantBookPurchase(userId, bookId, stripeSessionId)
    }
  }
}

/** Fallback reconciliation after a cart checkout redirect. */
export async function confirmCartCheckout(sessionId: string) {
  const user = await getCurrentUser()
  if (!user) return { owned: false }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const paid =
      session.payment_status === "paid" || session.status === "complete"
    const belongsToUser = session.metadata?.userId === user.id
    const ids = (session.metadata?.bookIds ?? "")
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (paid && belongsToUser && ids.length > 0) {
      await grantCartPurchase(user.id, ids, sessionId)
      revalidatePath("/app/library")
      revalidatePath("/app/books")
      return { owned: true, bookIds: ids }
    }
  } catch (error) {
    console.error("[v0] confirmCartCheckout failed:", error)
  }
  return { owned: false }
}

// ----- VOXYFI ratings & reviews (our own, for EVERY book) -----

/**
 * VOXYFI's own rating summary for a book. Works for EVERY book (in-app AND
 * affiliate) — these are our ratings, never sourced from Amazon. The aggregate
 * is only meaningful once `count >= MIN_RATINGS_TO_SHOW`; below that the UI
 * shows "Not enough ratings yet" rather than a misleading number.
 */
export async function getBookRating(bookId: number): Promise<BookRatingSummary> {
  const user = await getCurrentUser()
  const [agg] = await db
    .select({
      count: count(),
      sum: sql<number>`coalesce(sum(${bookRating.stars}), 0)`,
    })
    .from(bookRating)
    .where(eq(bookRating.bookId, bookId))

  const total = Number(agg?.count ?? 0)
  const sum = Number(agg?.sum ?? 0)
  const hasEnough = total >= MIN_RATINGS_TO_SHOW
  const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0

  let mine = 0
  if (user) {
    const [row] = await db
      .select({ stars: bookRating.stars })
      .from(bookRating)
      .where(and(eq(bookRating.bookId, bookId), eq(bookRating.userId, user.id)))
      .limit(1)
    mine = row?.stars ?? 0
  }

  return {
    average: hasEnough ? average : 0,
    count: total,
    mine,
    hasEnough,
    canRate: Boolean(user),
  }
}

/**
 * Submits (or updates) the signed-in user's VOXYFI rating for a book. Any
 * signed-in user may rate any title, including affiliate books. Idempotent per
 * (user, book) via upsert. Does NOT touch the Amazon purchase flow.
 */
export async function rateBook(bookId: number, stars: number) {
  const user = await getCurrentUser()
  if (!user) return { error: "Please sign in to rate books." }
  const value = Math.round(stars)
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return { error: "Rating must be between 1 and 5 stars." }
  }
  // Guard against rating a non-existent book.
  const [exists] = await db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.id, bookId))
    .limit(1)
  if (!exists) return { error: "That book no longer exists." }

  await db
    .insert(bookRating)
    .values({ userId: user.id, bookId, stars: value })
    .onConflictDoUpdate({
      target: [bookRating.userId, bookRating.bookId],
      set: { stars: value, updatedAt: new Date() },
    })
  revalidatePath(`/app/books/${bookId}`)
  return await getBookRating(bookId)
}

/**
 * Books similar to the given one for the detail page's "Similar Books" rail:
 * same category first, then other published titles, excluding the book itself.
 * Returns lean card rows; never includes the current book.
 */
export async function getRelatedBooks(
  bookId: number,
  category: string,
  limit = 12,
): Promise<BookCard[]> {
  const sameCategory = await db
    .select(bookCardColumns)
    .from(book)
    .where(
      and(
        eq(book.published, true),
        eq(book.category, category),
        ne(book.id, bookId),
      ),
    )
    .orderBy(desc(book.featured), desc(book.createdAt))
    .limit(limit)

  if (sameCategory.length >= limit) return sameCategory

  // Backfill with other published titles so the rail is never sparse.
  const excludeIds = [bookId, ...sameCategory.map((b) => b.id)]
  const fill = await db
    .select(bookCardColumns)
    .from(book)
    .where(and(eq(book.published, true), notInArray(book.id, excludeIds)))
    .orderBy(desc(book.featured), desc(book.createdAt))
    .limit(limit - sameCategory.length)

  return [...sameCategory, ...fill]
}
