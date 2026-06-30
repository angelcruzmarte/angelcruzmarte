"use server"

import { db } from "@/lib/db"
import { readingItem, user as userTable } from "@/lib/db/schema"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { count, desc, eq, sql } from "drizzle-orm"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new Error("Forbidden")
  return user!
}

export async function getSubscribers() {
  await requireAdmin()
  return db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      plan: userTable.plan,
      subscriptionStatus: userTable.subscriptionStatus,
      currentPeriodEnd: userTable.currentPeriodEnd,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .orderBy(desc(userTable.createdAt))
}

export async function getAdminStats() {
  await requireAdmin()
  const [totalUsers] = await db.select({ value: count() }).from(userTable)
  const [activeSubs] = await db
    .select({ value: count() })
    .from(userTable)
    .where(
      sql`${userTable.subscriptionStatus} in ('active', 'trialing')`,
    )
  const [totalItems] = await db.select({ value: count() }).from(readingItem)
  const [publishedItems] = await db
    .select({ value: count() })
    .from(readingItem)
    .where(eq(readingItem.published, true))

  return {
    totalUsers: totalUsers?.value ?? 0,
    activeSubscribers: activeSubs?.value ?? 0,
    totalItems: totalItems?.value ?? 0,
    publishedItems: publishedItems?.value ?? 0,
  }
}

/** Promote/demote a user between "admin" and "user". */
export async function setUserRole(userId: string, role: "admin" | "user") {
  await requireAdmin()
  await db
    .update(userTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(userTable.id, userId))
  revalidatePath("/admin/subscribers")
  return { success: true }
}
