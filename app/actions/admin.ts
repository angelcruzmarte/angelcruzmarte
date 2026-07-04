"use server"

import { db } from "@/lib/db"
import {
  book,
  bookPurchase,
  document as documentTable,
  readingItem,
  user as userTable,
} from "@/lib/db/schema"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { getPlan } from "@/lib/plans"
import { count, desc, eq, isNotNull, sql } from "drizzle-orm"
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
  const [totalBooks] = await db.select({ value: count() }).from(book)
  const [totalDocuments] = await db
    .select({ value: count() })
    .from(documentTable)
  const [totalPurchases] = await db
    .select({ value: count() })
    .from(bookPurchase)

  return {
    totalUsers: totalUsers?.value ?? 0,
    activeSubscribers: activeSubs?.value ?? 0,
    totalItems: totalItems?.value ?? 0,
    publishedItems: publishedItems?.value ?? 0,
    totalBooks: totalBooks?.value ?? 0,
    totalDocuments: totalDocuments?.value ?? 0,
    totalPurchases: totalPurchases?.value ?? 0,
  }
}

/** Monthly-equivalent recurring value (in cents) for a subscription plan. */
function monthlyCentsFor(planId: string | null): number {
  if (!planId) return 0
  const plan = getPlan(planId)
  if (!plan) return 0
  return plan.interval === "year"
    ? Math.round(plan.priceInCents / 12)
    : plan.priceInCents
}

/** Format a Date as a `YYYY-MM` bucket key. */
function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export type FinanceData = Awaited<ReturnType<typeof getFinanceData>>

/**
 * Comprehensive financial snapshot for the admin dashboard. Combines recurring
 * subscription revenue (MRR/ARR, computed from active plans) with one-time,
 * paid book sales. Free "Add & Listen" grants (no Stripe session) are excluded
 * from revenue and surfaced separately as an engagement metric.
 */
export async function getFinanceData() {
  await requireAdmin()

  // Paying / trialing subscribers with their plan + signup month.
  const subscribers = await db
    .select({
      plan: userTable.plan,
      status: userTable.subscriptionStatus,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(
      sql`${userTable.plan} is not null and ${userTable.subscriptionStatus} in ('active','trialing')`,
    )

  let mrr = 0
  let activePaying = 0
  let trialing = 0
  let monthlyPlanCount = 0
  let yearlyPlanCount = 0
  const subsByMonth = new Map<string, number>()

  for (const s of subscribers) {
    const monthly = monthlyCentsFor(s.plan)
    if (s.status === "active") {
      mrr += monthly
      activePaying += 1
    } else if (s.status === "trialing") {
      trialing += 1
    }
    if (s.plan === "yearly") yearlyPlanCount += 1
    else if (s.plan === "monthly") monthlyPlanCount += 1
    // Attribute recurring value to the signup month for the trend chart.
    if (s.status === "active") {
      const key = monthKey(new Date(s.createdAt))
      subsByMonth.set(key, (subsByMonth.get(key) ?? 0) + monthly)
    }
  }

  // Paid book sales (Stripe session present) joined to price + title + buyer.
  const paidSales = await db
    .select({
      price: book.priceInCents,
      title: book.title,
      author: book.author,
      email: userTable.email,
      name: userTable.name,
      createdAt: bookPurchase.createdAt,
    })
    .from(bookPurchase)
    .innerJoin(book, eq(bookPurchase.bookId, book.id))
    .leftJoin(userTable, eq(bookPurchase.userId, userTable.id))
    .where(isNotNull(bookPurchase.stripeSessionId))
    .orderBy(desc(bookPurchase.createdAt))

  // Free public-domain grants (no payment) — engagement, not revenue.
  const [freeAdds] = await db
    .select({ value: count() })
    .from(bookPurchase)
    .where(sql`${bookPurchase.stripeSessionId} is null`)

  const now = new Date()
  const thisMonthKey = monthKey(now)

  let bookRevenueAllTime = 0
  let bookRevenueThisMonth = 0
  let bookUnitsThisMonth = 0
  const salesByMonth = new Map<string, number>()

  for (const sale of paidSales) {
    bookRevenueAllTime += sale.price
    const key = monthKey(new Date(sale.createdAt))
    salesByMonth.set(key, (salesByMonth.get(key) ?? 0) + sale.price)
    if (key === thisMonthKey) {
      bookRevenueThisMonth += sale.price
      bookUnitsThisMonth += 1
    }
  }

  // Build a 12-month trend of new subscription MRR + book sales.
  const trend: {
    month: string
    label: string
    subscriptions: number
    books: number
  }[] = []
  for (let i = 11; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = monthKey(d)
    trend.push({
      month: key,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      subscriptions: Math.round((subsByMonth.get(key) ?? 0) / 100),
      books: Math.round((salesByMonth.get(key) ?? 0) / 100),
    })
  }

  const arpu = activePaying > 0 ? Math.round(mrr / activePaying) : 0

  return {
    mrr,
    arr: mrr * 12,
    arpu,
    activePaying,
    trialing,
    bookRevenueAllTime,
    bookUnitsAllTime: paidSales.length,
    bookRevenueThisMonth,
    bookUnitsThisMonth,
    freeAdds: freeAdds?.value ?? 0,
    revenueThisMonth: mrr + bookRevenueThisMonth,
    planBreakdown: { monthly: monthlyPlanCount, yearly: yearlyPlanCount },
    trend,
    recentSales: paidSales.slice(0, 12).map((s) => ({
      title: s.title,
      author: s.author,
      buyer: s.email ?? s.name ?? "Unknown",
      amount: s.price,
      createdAt: s.createdAt,
    })),
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
