"use server"

import { db } from "@/lib/db"
import {
  book,
  bookRating,
  moderationLog,
  user as userTable,
} from "@/lib/db/schema"
import { getCurrentUser, isAdmin, requireAdminPage } from "@/lib/session"
import { USER_STATUSES, type UserStatus } from "@/lib/moderation"
import { desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new Error("Forbidden")
  return user!
}

/** Appends a moderation audit entry with a snapshot of the acting admin. */
async function logModeration(
  actor: { id: string; name: string; email: string },
  entry: {
    action: string
    targetType?: string
    targetId?: string
    targetUserId?: string
    note?: string
  },
) {
  await db.insert(moderationLog).values({
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    targetUserId: entry.targetUserId ?? null,
    note: entry.note ?? null,
  })
}

// ----- Book ratings management (replaces the old written-review queue) -----

export type RatingDistribution = {
  1: number
  2: number
  3: number
  4: number
  5: number
}

export type BookRatingRow = {
  bookId: number
  title: string
  author: string
  count: number
  average: number
  distribution: RatingDistribution
}

export type InvalidRatingRow = {
  id: number
  bookId: number
  bookTitle: string
  userId: string
  stars: number
  createdAt: string
}

export type RecentRatingRow = {
  id: number
  bookId: number
  bookTitle: string
  stars: number
  createdAt: string
}

export type RatingsOverview = {
  stats: {
    totalRatings: number
    booksRated: number
    averageRating: number
    recentRatings: RecentRatingRow[]
  }
  books: BookRatingRow[]
  invalid: InvalidRatingRow[]
}

/**
 * Aggregated, real-database rating data for the admin Book Ratings section:
 * headline stats, per-book average / count / distribution, recent ratings, and
 * any out-of-range (invalid) rating records an admin might want to remove. All
 * values are computed from actual `book_rating` rows — never faked. Admin-only.
 */
export async function getRatingsOverview(): Promise<RatingsOverview> {
  // Runs during a page render → redirect (not throw) for non-admins so a
  // replaced session never triggers the error boundary.
  await requireAdminPage()

  // Per-(book, stars) tallies drive both the per-book distribution and the
  // global aggregate, in a single grouped scan.
  const distRows = await db
    .select({
      bookId: bookRating.bookId,
      stars: bookRating.stars,
      n: sql<number>`count(*)::int`,
    })
    .from(bookRating)
    .groupBy(bookRating.bookId, bookRating.stars)

  const byBook = new Map<
    number,
    { count: number; sum: number; dist: RatingDistribution }
  >()
  let totalRatings = 0
  let totalSum = 0
  for (const r of distRows) {
    const n = Number(r.n)
    const stars = Number(r.stars)
    totalRatings += n
    totalSum += n * stars
    let entry = byBook.get(r.bookId)
    if (!entry) {
      entry = { count: 0, sum: 0, dist: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }
      byBook.set(r.bookId, entry)
    }
    entry.count += n
    entry.sum += n * stars
    if (stars >= 1 && stars <= 5) {
      entry.dist[stars as 1 | 2 | 3 | 4 | 5] += n
    }
  }

  // Titles for the books that actually have ratings.
  const bookIds = [...byBook.keys()]
  const titles = new Map<number, { title: string; author: string }>()
  if (bookIds.length > 0) {
    const titleRows = await db
      .select({ id: book.id, title: book.title, author: book.author })
      .from(book)
      .where(inArray(book.id, bookIds))
    for (const t of titleRows) titles.set(t.id, { title: t.title, author: t.author })
  }

  const books: BookRatingRow[] = [...byBook.entries()]
    .map(([bookId, e]) => ({
      bookId,
      title: titles.get(bookId)?.title ?? `Book #${bookId}`,
      author: titles.get(bookId)?.author ?? "",
      count: e.count,
      average: e.count > 0 ? Math.round((e.sum / e.count) * 10) / 10 : 0,
      distribution: e.dist,
    }))
    .sort((a, b) => b.count - a.count || b.average - a.average)

  // Recent ratings (with book title) for the dashboard-style activity list.
  const recentRows = await db
    .select({
      id: bookRating.id,
      bookId: bookRating.bookId,
      stars: bookRating.stars,
      createdAt: bookRating.createdAt,
      bookTitle: book.title,
    })
    .from(bookRating)
    .leftJoin(book, eq(book.id, bookRating.bookId))
    .orderBy(desc(bookRating.createdAt))
    .limit(10)

  const recentRatings: RecentRatingRow[] = recentRows.map((r) => ({
    id: r.id,
    bookId: r.bookId,
    bookTitle: r.bookTitle ?? `Book #${r.bookId}`,
    stars: r.stars,
    createdAt: r.createdAt.toISOString(),
  }))

  // Out-of-range records: a valid rating is a whole number 1-5, so anything
  // outside that range is invalid and surfaced for admin removal.
  const invalidRows = await db
    .select({
      id: bookRating.id,
      bookId: bookRating.bookId,
      userId: bookRating.userId,
      stars: bookRating.stars,
      createdAt: bookRating.createdAt,
      bookTitle: book.title,
    })
    .from(bookRating)
    .leftJoin(book, eq(book.id, bookRating.bookId))
    .where(or(lt(bookRating.stars, 1), gt(bookRating.stars, 5)))
    .orderBy(desc(bookRating.createdAt))
    .limit(100)

  const invalid: InvalidRatingRow[] = invalidRows.map((r) => ({
    id: r.id,
    bookId: r.bookId,
    bookTitle: r.bookTitle ?? `Book #${r.bookId}`,
    userId: r.userId,
    stars: r.stars,
    createdAt: r.createdAt.toISOString(),
  }))

  return {
    stats: {
      totalRatings,
      booksRated: byBook.size,
      averageRating:
        totalRatings > 0 ? Math.round((totalSum / totalRatings) * 10) / 10 : 0,
      recentRatings,
    },
    books,
    invalid,
  }
}

/**
 * Removes a single rating record (e.g. an invalid / out-of-range row). This is
 * the only administrative mutation on ratings — admins never edit a user's
 * chosen star value — and every removal is recorded in the moderation audit
 * trail. Admin-only.
 */
export async function deleteRating(ratingId: number) {
  const admin = await requireAdmin()
  const id = Number(ratingId)
  if (!Number.isInteger(id) || id <= 0) return { error: "Invalid rating." }

  const [row] = await db
    .select({
      userId: bookRating.userId,
      bookId: bookRating.bookId,
      stars: bookRating.stars,
    })
    .from(bookRating)
    .where(eq(bookRating.id, id))
    .limit(1)
  if (!row) return { error: "That rating no longer exists." }

  await db.delete(bookRating).where(eq(bookRating.id, id))

  await logModeration(admin, {
    action: "delete_rating",
    targetType: "book_rating",
    targetId: String(id),
    targetUserId: row.userId,
    note: `Removed ${row.stars}-star rating on book #${row.bookId}`,
  })
  revalidatePath("/admin/moderation")
  revalidatePath(`/app/books/${row.bookId}`)
  return { ok: true as const }
}

// ----- Account moderation (general user management) -----

/** Suspends, restricts, or reinstates an account. Cannot target yourself. */
export async function setUserStatus(
  userId: string,
  status: string,
  reason?: string,
) {
  const admin = await requireAdmin()
  if (!USER_STATUSES.includes(status as UserStatus)) {
    return { error: "Invalid status." }
  }
  const target = String(userId ?? "")
  if (!target) return { error: "Invalid user." }
  if (target === admin.id) {
    return { error: "You can't change your own account status." }
  }

  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, target))
    .limit(1)
  if (!row) return { error: "That user no longer exists." }

  await db
    .update(userTable)
    .set({
      status,
      statusReason: (reason ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, target))

  const action =
    status === "suspended"
      ? "suspend_user"
      : status === "restricted"
        ? "restrict_user"
        : "reinstate_user"
  await logModeration(admin, {
    action,
    targetType: "user",
    targetUserId: target,
    note: (reason ?? "").trim() || undefined,
  })
  revalidatePath(`/admin/users/${target}`)
  revalidatePath("/admin/users")
  return { ok: true as const }
}

export type ModerationLogRow = {
  id: number
  actorName: string
  actorEmail: string
  action: string
  targetType: string | null
  targetId: string | null
  targetUserId: string | null
  note: string | null
  createdAt: string
}

/** Append-only moderation audit trail, newest first. Admin-only. */
export async function queryModerationLog({
  page = 1,
  pageSize = 100,
}: { page?: number; pageSize?: number } = {}): Promise<ModerationLogRow[]> {
  await requireAdminPage()
  const offset = (Math.max(1, page) - 1) * pageSize
  const rows = await db
    .select()
    .from(moderationLog)
    .orderBy(desc(moderationLog.createdAt))
    .limit(pageSize)
    .offset(offset)
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    actorEmail: r.actorEmail,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetUserId: r.targetUserId,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }))
}
