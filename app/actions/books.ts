"use server"

import { db } from "@/lib/db"
import { book, bookPurchase } from "@/lib/db/schema"
import { INTEREST_LABELS } from "@/lib/interests"
import { getCurrentUser, getUserId } from "@/lib/session"
import { stripe } from "@/lib/stripe"
import { getBaseUrl } from "@/lib/urls"
import { and, desc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { getMyInterests } from "./interests"

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
