"use server"

import { db } from "@/lib/db"
import {
  bookRating,
  contentReport,
  user as userTable,
  userBlock,
} from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import {
  CONTENT_TYPE_BOOK_REVIEW,
  MAX_REPORT_DETAILS,
  REPORT_REASON_VALUES,
} from "@/lib/moderation"
import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  return user
}

/**
 * Resolves the author of a piece of reportable content, validating that it
 * exists. The reported user is derived server-side from the content itself —
 * never trusted from the client — so a reporter cannot mis-attribute a report.
 */
async function resolveContentAuthor(
  contentType: string,
  contentId: string,
): Promise<{ authorId: string } | null> {
  if (contentType === CONTENT_TYPE_BOOK_REVIEW) {
    const id = Number(contentId)
    if (!Number.isInteger(id) || id <= 0) return null
    const [row] = await db
      .select({ userId: bookRating.userId })
      .from(bookRating)
      .where(eq(bookRating.id, id))
      .limit(1)
    return row ? { authorId: row.userId } : null
  }
  return null
}

/**
 * Files a report against a piece of UGC. Stores reporter, reported user
 * (resolved server-side), content ref, reason, optional details, timestamp and
 * a `pending` status. A DB unique constraint on (reporter, contentType,
 * contentId) prevents duplicate reports from the same user for the same item.
 */
export async function submitReport(input: {
  contentType: string
  contentId: string
  reason: string
  details?: string
}) {
  const current = await getCurrentUser()
  if (!current) {
    console.error("[v0] submitReport: no session (Unauthorized)")
    return {
      error: "Please sign in again to submit your report.",
    }
  }
  const user = current
  console.log(
    "[v0] submitReport: user",
    user.id.slice(0, 8),
    "content",
    input.contentType,
    input.contentId,
  )

  const contentType = String(input.contentType ?? "")
  const contentId = String(input.contentId ?? "")
  if (contentType !== CONTENT_TYPE_BOOK_REVIEW) {
    return { error: "Unsupported content type." }
  }
  if (!REPORT_REASON_VALUES.includes(String(input.reason))) {
    return { error: "Please choose a valid reason." }
  }
  const details =
    (input.details ?? "").trim().slice(0, MAX_REPORT_DETAILS) || null

  const author = await resolveContentAuthor(contentType, contentId)
  if (!author) return { error: "That content no longer exists." }
  if (author.authorId === user.id) {
    return { error: "You can't report your own content." }
  }

  try {
    await db.insert(contentReport).values({
      reporterId: user.id,
      reportedUserId: author.authorId,
      contentType,
      contentId,
      reason: String(input.reason),
      details,
    })
    console.log("[v0] submitReport: inserted report OK")
  } catch (err) {
    // 23505 = unique_violation: this user already reported this content, which
    // is an idempotent success. ANY OTHER error is a real failure — log the
    // actual error and report it, so the UI never shows "submitted" when
    // nothing was persisted.
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: string }).code
        : undefined
    if (code === "23505") {
      return { ok: true as const, duplicate: true as const }
    }
    console.error("[v0] submitReport: failed to insert content_report:", err)
    return { error: "We couldn't submit your report. Please try again." }
  }

  return { ok: true as const }
}

/** Blocks another user. Idempotent. Their UGC disappears from the blocker's views. */
export async function blockUser(blockedId: string) {
  const current = await getCurrentUser()
  if (!current) {
    console.error("[v0] blockUser: no session (Unauthorized)")
    return { error: "Please sign in again to block this user." }
  }
  const user = current
  const target = String(blockedId ?? "")
  if (!target || target === user.id) {
    return { error: "You can't block yourself." }
  }
  const [exists] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, target))
    .limit(1)
  if (!exists) return { error: "That user no longer exists." }

  await db
    .insert(userBlock)
    .values({ blockerId: user.id, blockedId: target })
    .onConflictDoNothing()
  console.log(
    "[v0] blockUser: user",
    user.id.slice(0, 8),
    "blocked",
    target.slice(0, 8),
  )

  revalidatePath("/app/profile/blocked")
  return { ok: true as const }
}

/** Removes a block the current user previously created. */
export async function unblockUser(blockedId: string) {
  const user = await requireUser()
  await db
    .delete(userBlock)
    .where(
      and(
        eq(userBlock.blockerId, user.id),
        eq(userBlock.blockedId, String(blockedId ?? "")),
      ),
    )
  revalidatePath("/app/profile/blocked")
  return { ok: true as const }
}

export type BlockedUser = {
  id: string
  name: string
  username: string | null
  image: string | null
  blockedAt: string
}

/** The users the current user has blocked, for the Blocked Users settings page. */
export async function getBlockedUsers(): Promise<BlockedUser[]> {
  const user = await requireUser()
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      username: userTable.username,
      image: userTable.image,
      blockedAt: userBlock.createdAt,
    })
    .from(userBlock)
    .innerJoin(userTable, eq(userTable.id, userBlock.blockedId))
    .where(eq(userBlock.blockerId, user.id))
    .orderBy(desc(userBlock.createdAt))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    username: r.username,
    image: r.image,
    blockedAt: r.blockedAt.toISOString(),
  }))
}
