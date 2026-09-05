"use server"

import { db } from "@/lib/db"
import {
  user as userTable,
  document,
  listeningStat,
  aiQuota,
  userInterest,
  bookPurchase,
  bookFavorite,
  bookRating,
  contentReport,
  userBlock,
  session as sessionTable,
  account as accountTable,
} from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { and, eq, ne, or, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

/** Listening preference keys that map to boolean columns on the user table. */
export type PreferenceKey =
  | "prefAutoPlay"
  | "prefAutoHide"
  | "prefMixAudio"
  | "prefAutoSkip"

/** Persists a single boolean listening preference for the signed-in user. */
export async function updatePreference(
  key: PreferenceKey,
  value: boolean,
): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  await db
    .update(userTable)
    .set({ [key]: value, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  revalidatePath("/app/profile")
  return { ok: true }
}

/** Sets the daily listening goal (minutes). Clamped to a sensible range. */
export async function updateDailyGoal(
  minutes: number,
): Promise<{ ok: boolean }> {
  const userId = await getUserId()
  const clamped = Math.max(5, Math.min(240, Math.round(minutes)))
  await db
    .update(userTable)
    .set({ dailyGoalMinutes: clamped, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  revalidatePath("/app/profile")
  revalidatePath("/app/stats")
  return { ok: true }
}

/**
 * Permanently deletes the signed-in user's account and ALL associated data.
 * This cannot be undone. The client is responsible for signing out and
 * redirecting after this resolves.
 */
export async function deleteAccount(): Promise<{ ok: boolean }> {
  const userId = await getUserId()

  // Delete the account and ALL associated data atomically: either every row
  // (child data, user-generated content, moderation rows, and the user itself)
  // is removed together, or nothing is — so a mid-way failure can never leave a
  // half-deleted account or orphaned references behind.
  await db.transaction(async (tx) => {
    // App data that references the user by id (no ON DELETE CASCADE on all).
    await tx.delete(document).where(eq(document.userId, userId))
    await tx.delete(listeningStat).where(eq(listeningStat.userId, userId))
    await tx.delete(aiQuota).where(eq(aiQuota.userId, userId))
    await tx.delete(userInterest).where(eq(userInterest.userId, userId))
    await tx.delete(bookPurchase).where(eq(bookPurchase.userId, userId))
    await tx.delete(bookFavorite).where(eq(bookFavorite.userId, userId))

    // User-generated content + moderation rows (Apple account-deletion): their
    // book reviews, any reports they filed or that named them, and any blocks
    // in either direction. This guarantees no deleted user's review remains
    // publicly visible and leaves no dangling report/block references. The
    // admin-only moderation_log audit trail is intentionally retained (it holds
    // no personal data beyond a snapshotted actor label and is required for
    // moderation-audit purposes).
    await tx.delete(bookRating).where(eq(bookRating.userId, userId))
    await tx
      .delete(contentReport)
      .where(
        or(
          eq(contentReport.reporterId, userId),
          eq(contentReport.reportedUserId, userId),
        ),
      )
    await tx
      .delete(userBlock)
      .where(
        or(eq(userBlock.blockerId, userId), eq(userBlock.blockedId, userId)),
      )

    // Auth rows, then the user record itself.
    await tx.delete(sessionTable).where(eq(sessionTable.userId, userId))
    await tx.delete(accountTable).where(eq(accountTable.userId, userId))
    await tx.delete(userTable).where(eq(userTable.id, userId))
  })

  return { ok: true }
}

/** Updates the signed-in user's display name. */
export async function updateDisplayName(name: string): Promise<{
  ok: boolean
  error?: string
}> {
  const userId = await getUserId()
  const trimmed = name.trim()
  if (trimmed.length < 2) {
    return { ok: false, error: "Name must be at least 2 characters." }
  }
  if (trimmed.length > 60) {
    return { ok: false, error: "Name is too long." }
  }

  await db
    .update(userTable)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(userTable.id, userId))

  revalidatePath("/app/profile")
  return { ok: true }
}

/**
 * Sets the signed-in user's unique @username handle.
 * Rules: 3-20 chars, lowercase letters, numbers and underscores, must start
 * with a letter. Case-insensitively unique across all users.
 */
export async function updateUsername(username: string): Promise<{
  ok: boolean
  error?: string
}> {
  const userId = await getUserId()
  const handle = username.trim().toLowerCase().replace(/^@+/, "")

  if (handle.length < 3) {
    return { ok: false, error: "Username must be at least 3 characters." }
  }
  if (handle.length > 20) {
    return { ok: false, error: "Username must be 20 characters or fewer." }
  }
  if (!/^[a-z][a-z0-9_]*$/.test(handle)) {
    return {
      ok: false,
      error: "Use letters, numbers and underscores; start with a letter.",
    }
  }

  // Ensure no other account already owns this handle (case-insensitive).
  const taken = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(
      and(
        sql`lower(${userTable.username}) = ${handle}`,
        ne(userTable.id, userId),
      ),
    )
    .limit(1)
  if (taken.length > 0) {
    return { ok: false, error: "That username is already taken." }
  }

  await db
    .update(userTable)
    .set({ username: handle, updatedAt: new Date() })
    .where(eq(userTable.id, userId))

  revalidatePath("/app/profile")
  return { ok: true }
}

function makeCode(): string {
  // Human-friendly, ambiguous characters removed.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

/**
 * Returns the user's referral code, generating and persisting one on first use.
 */
export async function getOrCreateReferralCode(): Promise<string> {
  const userId = await getUserId()
  const rows = await db
    .select({ referralCode: userTable.referralCode })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  const existing = rows[0]?.referralCode
  if (existing) return existing

  const code = makeCode()
  await db
    .update(userTable)
    .set({ referralCode: code, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  return code
}
