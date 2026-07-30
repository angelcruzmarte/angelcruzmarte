import "server-only"

import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm"

import { db } from "@/lib/db"
import { bookEvent } from "@/lib/db/schema"
import { ACTIVE_AFFILIATE_PROVIDER } from "@/lib/affiliate"

export type BookEventType = "affiliate_click" | "native_purchase"

/**
 * Generic append-only event recorder. Best-effort; never throws into the
 * request path. Prefer this single entry point from callers.
 */
export async function recordBookEvent(input: {
  type: BookEventType
  bookId?: number | null
  bookTitle: string
  author?: string | null
  provider: string
  amountCents?: number
  userId?: string | null
}): Promise<void> {
  try {
    await db.insert(bookEvent).values({
      type: input.type,
      bookId: input.bookId ?? null,
      bookTitle: input.bookTitle.slice(0, 500),
      author: (input.author ?? "").slice(0, 500),
      provider: input.provider,
      amountCents: Math.max(0, Math.round(input.amountCents ?? 0)),
      userId: input.userId ?? null,
    })
  } catch {
    // Swallow — analytics is best-effort.
  }
}

/**
 * Records a click-out to a retail affiliate (Amazon). Fire-and-forget: never
 * throws into the request path, since tracking must not break the buy flow.
 */
export async function recordAffiliateClick(input: {
  bookId?: number | null
  title: string
  author?: string | null
  userId?: string | null
}): Promise<void> {
  try {
    await db.insert(bookEvent).values({
      type: "affiliate_click",
      bookId: input.bookId ?? null,
      bookTitle: input.title.slice(0, 500),
      author: (input.author ?? "").slice(0, 500),
      provider: ACTIVE_AFFILIATE_PROVIDER,
      amountCents: 0,
      userId: input.userId ?? null,
    })
  } catch {
    // Swallow — analytics is best-effort.
  }
}

/**
 * Records a completed native (VOXYFI/Stripe) purchase with its revenue. Called
 * from the Stripe grant path. Best-effort; never throws.
 */
export async function recordNativePurchase(input: {
  bookId?: number | null
  title: string
  author?: string | null
  amountCents: number
  userId?: string | null
}): Promise<void> {
  try {
    await db.insert(bookEvent).values({
      type: "native_purchase",
      bookId: input.bookId ?? null,
      bookTitle: input.title.slice(0, 500),
      author: (input.author ?? "").slice(0, 500),
      provider: "voxyfi",
      amountCents: Math.max(0, Math.round(input.amountCents)),
      userId: input.userId ?? null,
    })
  } catch {
    // Swallow — analytics is best-effort.
  }
}

export type TopAffiliateBook = {
  bookId: number | null
  title: string
  author: string
  clicks: number
}

export type BookAnalytics = {
  affiliateClicks: number
  nativePurchases: number
  nativeRevenueCents: number
  /** Purchases ÷ (purchases + clicks). Store-level purchase intent. */
  conversionRate: number
  windowDays: number
  topAffiliateBooks: TopAffiliateBook[]
}

/**
 * Aggregate bookstore commerce metrics over the last `windowDays`.
 *
 * NOTE ON AFFILIATE REVENUE: Amazon Associates reports earnings only on the
 * Amazon side, not back to the app. We therefore track affiliate *clicks*
 * (leading indicator) here; actual affiliate commission must be read from the
 * Amazon Associates dashboard. Native (Stripe) revenue is exact.
 */
export async function getBookAnalytics(windowDays = 30): Promise<BookAnalytics> {
  const since = new Date()
  since.setDate(since.getDate() - windowDays)
  const inWindow = gte(bookEvent.createdAt, since)

  const [clicksRow] = await db
    .select({ value: count() })
    .from(bookEvent)
    .where(and(eq(bookEvent.type, "affiliate_click"), inWindow))

  const [purchaseRow] = await db
    .select({
      value: count(),
      revenue: sum(bookEvent.amountCents),
    })
    .from(bookEvent)
    .where(and(eq(bookEvent.type, "native_purchase"), inWindow))

  const affiliateClicks = clicksRow?.value ?? 0
  const nativePurchases = purchaseRow?.value ?? 0
  const nativeRevenueCents = Number(purchaseRow?.revenue ?? 0)

  const denom = affiliateClicks + nativePurchases
  const conversionRate = denom > 0 ? nativePurchases / denom : 0

  const topAffiliateBooks = await db
    .select({
      bookId: bookEvent.bookId,
      title: sql<string>`max(${bookEvent.bookTitle})`,
      author: sql<string>`max(${bookEvent.author})`,
      clicks: count(),
    })
    .from(bookEvent)
    .where(and(eq(bookEvent.type, "affiliate_click"), inWindow))
    .groupBy(bookEvent.bookId)
    .orderBy(desc(count()))
    .limit(10)

  return {
    affiliateClicks,
    nativePurchases,
    nativeRevenueCents,
    conversionRate,
    windowDays,
    topAffiliateBooks: topAffiliateBooks.map((r) => ({
      bookId: r.bookId,
      title: r.title || "(unknown)",
      author: r.author || "",
      clicks: r.clicks,
    })),
  }
}

/** Alias used by the admin finance dashboard (last 30 days). */
export function getAffiliateAnalytics(): Promise<BookAnalytics> {
  return getBookAnalytics(30)
}
