"use server"

import { db } from "@/lib/db"
import { user as userTable, userBlock } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { and, desc, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Unauthorized")
  return user
}

/**
 * Blocks another user. Idempotent. This is part of Voxyfi's general
 * user-safety system (independent of the removed written-review feature): a
 * blocked user cannot interact with the blocker and is filtered out of the
 * blocker's views wherever people are surfaced.
 */
export async function blockUser(blockedId: string) {
  const current = await getCurrentUser()
  if (!current) {
    console.error("[v0] blockUser: no session (Unauthorized)")
    return { error: "Please sign in again to block this user." }
  }
  const user = current
  const target = String(blockedId ?? "")
  if (!target || target === user.id) {
    return {
      error:
        "You can't block yourself. You're signed in as this account — sign in with a different account to block it.",
    }
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
