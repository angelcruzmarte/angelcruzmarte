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

/**
 * Emails that always have admin access, regardless of the stored role. Lets a
 * known owner account test the full app even if its DB role was never promoted.
 */
const ADMIN_EMAILS = new Set<string>(["admin@voxyfi.com"])

export function isAdmin(u: User | null): boolean {
  if (!u) return false
  return u.role === "admin" || ADMIN_EMAILS.has(u.email.toLowerCase())
}

/**
 * True when the account is inside a 7-day free trial that has NOT yet expired.
 * For a trialing Stripe subscription, `currentPeriodEnd` holds the trial end
 * date, so once that moment passes the trial is over even if a webhook hasn't
 * yet flipped the stored status. A missing end date is treated as still-active
 * to avoid wrongly locking a legitimate in-progress trial.
 */
export function isTrialActive(u: User | null): boolean {
  if (!u || u.subscriptionStatus !== "trialing") return false
  if (!u.currentPeriodEnd) return true
  return new Date(u.currentPeriodEnd).getTime() > Date.now()
}

/** True once a free trial has ended without converting to a paid plan. */
export function isTrialExpired(u: User | null): boolean {
  if (!u || u.subscriptionStatus !== "trialing") return false
  if (!u.currentPeriodEnd) return false
  return new Date(u.currentPeriodEnd).getTime() <= Date.now()
}

/**
 * Whether the account may use premium features. Admins always qualify (for
 * testing). Everyone else needs an active paid subscription OR a trial that is
 * still within its 7-day window — once the trial ends, access is limited to
 * encourage them to subscribe.
 */
export function hasActiveSubscription(u: User | null): boolean {
  if (!u) return false
  if (isAdmin(u)) return true
  if (u.subscriptionStatus === "active") return true
  return isTrialActive(u)
}
