"use server"

import { db } from "@/lib/db"
import {
  user as userTable,
  document,
  listeningStat,
  aiQuota,
  readingItem,
  userInterest,
  bookPurchase,
  bookFavorite,
  session as sessionTable,
  account as accountTable,
} from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { and, eq, ne, sql } from "drizzle-orm"
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

  // Remove all child rows first (these tables reference the user by id but do
  // not all have ON DELETE CASCADE), then the user row itself.
  await db.delete(document).where(eq(document.userId, userId))
  await db.delete(listeningStat).where(eq(listeningStat.userId, userId))
  await db.delete(aiQuota).where(eq(aiQuota.userId, userId))
  await db.delete(readingItem).where(eq(readingItem.userId, userId))
  await db.delete(userInterest).where(eq(userInterest.userId, userId))
  await db.delete(bookPurchase).where(eq(bookPurchase.userId, userId))
  await db.delete(bookFavorite).where(eq(bookFavorite.userId, userId))
  await db.delete(sessionTable).where(eq(sessionTable.userId, userId))
  await db.delete(accountTable).where(eq(accountTable.userId, userId))
  await db.delete(userTable).where(eq(userTable.id, userId))

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
