"use server"

import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

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
