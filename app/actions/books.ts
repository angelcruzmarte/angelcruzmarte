"use server"

import { db } from "@/lib/db"
import { book, bookFavorite, bookPurchase } from "@/lib/db/schema"
import { fetchAndParseGutenberg, gutenbergCoverUrl } from "@/lib/gutenberg"
import { INTEREST_LABELS } from "@/lib/interests"
import { getCurrentUser, getUserId } from "@/lib/session"
import { stripe } from "@/lib/stripe"
import { getBaseUrl } from "@/lib/urls"
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getMyInterests } from "./interests"

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

export async function getBooks() {
  return db.select().from(book).orderBy(desc(book.featured), desc(book.createdAt))
}

export async function getBook(id: number) {
  const [row] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  return row ?? null
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
  await db
    .insert(bookPurchase)
    .values({ userId, bookId, stripeSessionId })
    .onConflictDoNothing({
      target: [bookPurchase.userId, bookPurchase.bookId],
    })
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

  const [inserted] = await db
    .insert(book)
    .values({
      title: meta.title?.trim() || parsed.title,
      author: meta.author?.trim() || parsed.author,
      category: meta.category?.trim() || "Classics",
      description: parsed.description,
      excerpt: parsed.excerpt,
      content: parsed.body,
      priceInCents: IMPORTED_BOOK_PRICE,
      coverImageUrl: meta.coverUrl || gutenbergCoverUrl(gutenbergId),
      gutenbergId,
      coverColor: color,
      accentColor: accent,
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
 * Returns books ranked by how well their category matches the user's selected
 * interests. Falls back to featured/newest when no interests are set.
 */
export async function getPersonalizedBooks() {
  const [all, interestIds] = await Promise.all([getBooks(), getMyInterests()])
  const wanted = new Set(
    interestIds.map((id) => (INTEREST_LABELS.get(id) ?? id).toLowerCase()),
  )
  if (wanted.size === 0) return { books: all, personalized: false }

  const ranked = [...all].sort((a, b) => {
    const aMatch = wanted.has(a.category.toLowerCase()) ? 1 : 0
    const bMatch = wanted.has(b.category.toLowerCase()) ? 1 : 0
    if (aMatch !== bMatch) return bMatch - aMatch
    return Number(b.featured) - Number(a.featured)
  })
  return { books: ranked, personalized: true }
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
  const toBuy = rows.filter((b) => !ownedIds.has(b.id))

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
