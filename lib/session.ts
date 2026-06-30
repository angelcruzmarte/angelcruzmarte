import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { user as userTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"
import type { User } from "@/lib/db/schema"

/** Returns the full DB user row for the current session, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return null
  const rows = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, session.user.id))
    .limit(1)
  return rows[0] ?? null
}

/** Throws if not authenticated. Returns the session user id. */
export async function getUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

/** An active subscription means status is "active" or "trialing". */
export function hasActiveSubscription(u: User | null): boolean {
  if (!u) return false
  return u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing"
}

export function isAdmin(u: User | null): boolean {
  return u?.role === "admin"
}
