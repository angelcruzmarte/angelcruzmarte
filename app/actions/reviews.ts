"use server"

import { db } from "@/lib/db"
import { book, bookRating, user as userTable } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { getBlockedIds } from "@/lib/blocks"
import { screenContent } from "@/lib/content-filter"
import { MAX_REVIEW_LENGTH, type PublicReview } from "@/lib/moderation"
import { and, desc, eq, isNotNull, ne, notInArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/**
 * Creates or updates the signed-in user's written review (with stars) for a
 * book. This is the user-generated content other users can read, so posting is
 * blocked for restricted/suspended accounts. Idempotent per (user, book) via
 * upsert. Validated entirely server-side.
 */
export async function submitReview(
  bookId: number,
  stars: number,
  review: string,
) {
  const user = await getCurrentUser()
  if (!user) return { error: "Please sign in to write a review." }
  if (user.status === "suspended" || user.status === "restricted") {
    return { error: "Your account is not allowed to post reviews." }
  }
  const value = Math.round(stars)
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    return { error: "Please choose a star rating between 1 and 5." }
  }
  const text = (review ?? "").trim()
  if (text.length > MAX_REVIEW_LENGTH) {
    return { error: `Reviews must be ${MAX_REVIEW_LENGTH} characters or fewer.` }
  }
  // Pre-posting objectionable-content filter (Apple Guideline 1.2). Screened
  // BEFORE the review is stored, so disallowed language never becomes visible.
  if (text) {
    const screen = screenContent(text)
    if (!screen.ok) return { error: screen.reason }
  }

  const [exists] = await db
    .select({ id: book.id })
    .from(book)
    .where(eq(book.id, bookId))
    .limit(1)
  if (!exists) return { error: "That book no longer exists." }

  await db
    .insert(bookRating)
    .values({ userId: user.id, bookId, stars: value, review: text || null })
    .onConflictDoUpdate({
      target: [bookRating.userId, bookRating.bookId],
      set: { stars: value, review: text || null, updatedAt: new Date() },
    })

  revalidatePath(`/app/books/${bookId}`)
  return { ok: true as const }
}

/**
 * Public written reviews for a book, each with the author's public display
 * identity (name / @handle / avatar — never email). Hidden from the viewer:
 * moderator-hidden reviews, reviews by suspended authors (global), and reviews
 * by anyone the viewer has blocked. This filtering is what makes a blocked
 * user's content disappear from the blocker's view.
 */
export async function getBookReviews(bookId: number): Promise<PublicReview[]> {
  const viewer = await getCurrentUser()
  const blocked = viewer ? await getBlockedIds(viewer.id) : []

  const conds = [
    eq(bookRating.bookId, bookId),
    isNotNull(bookRating.review),
    eq(bookRating.hidden, false),
    ne(userTable.status, "suspended"),
  ]
  if (blocked.length > 0) {
    conds.push(notInArray(bookRating.userId, blocked))
  }

  const rows = await db
    .select({
      id: bookRating.id,
      userId: bookRating.userId,
      stars: bookRating.stars,
      review: bookRating.review,
      createdAt: bookRating.createdAt,
      authorName: userTable.name,
      authorUsername: userTable.username,
      authorImage: userTable.image,
    })
    .from(bookRating)
    .innerJoin(userTable, eq(userTable.id, bookRating.userId))
    .where(and(...conds))
    .orderBy(desc(bookRating.createdAt))
    .limit(200)

  return rows
    .filter((r) => (r.review ?? "").trim().length > 0)
    .map((r) => ({
      id: r.id,
      userId: r.userId,
      authorName: r.authorName,
      authorUsername: r.authorUsername,
      authorImage: r.authorImage,
      stars: r.stars,
      review: (r.review ?? "").trim(),
      createdAt: r.createdAt.toISOString(),
      isMine: viewer?.id === r.userId,
    }))
}
