"use server"

import { db } from "@/lib/db"
import {
  book,
  bookAuditLog,
  bookPurchase,
  document as documentTable,
  readingItem,
  user as userTable,
} from "@/lib/db/schema"
import { getCurrentUser, isAdmin } from "@/lib/session"
import { getPlan } from "@/lib/plans"
import { stripe } from "@/lib/stripe"
import { runLinkCheck } from "@/lib/book-link-check"
import { getAffiliateAnalytics } from "@/lib/book-analytics"
import { AMAZON_MARKETPLACES } from "@/lib/affiliate"
import {
  resolveAffiliateSettings,
  saveAmazonRegion,
  saveAmazonTag,
} from "@/lib/affiliate-settings"
import {
  countPrunable,
  fetchPrunable,
  getRetentionPolicy,
  prunePolicy,
  retentionCutoff,
  saveRetentionPolicy,
  type AuditRetentionPolicy,
} from "@/lib/audit-retention"
import {
  diffBookChanges,
  logBookAudit,
  type AuditActor,
} from "@/lib/book-audit"
import {
  DEFAULT_AVAILABILITY,
  isAvailability,
  type Availability,
} from "@/lib/book-availability"
import {
  dedupeKey,
  scoreBook,
  type QualityReport,
} from "@/lib/book-quality"
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new Error("Forbidden")
  return user!
}

/** Builds the audit actor snapshot from an admin user row. */
function actorOf(u: { id: string; name: string; email: string }): AuditActor {
  return { id: u.id, name: u.name, email: u.email }
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

  // Affiliate (Amazon) click-through + native-store analytics.
  const affiliate = await getAffiliateAnalytics()

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
    affiliate,
  }
}

export type AdminUser = {
  id: string
  name: string
  email: string
  username: string | null
  role: string
  plan: string | null
  subscriptionStatus: string | null
  currentPeriodEnd: Date | null
  hasUsedTrial: boolean
  onboardingComplete: boolean
  emailVerified: boolean
  referralCode: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  image: string | null
  updatedAt: Date | null
  createdAt: Date
  isPaying: boolean
}

/** Full user directory with derived paying/free classification. */
export async function getUsers(): Promise<AdminUser[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      username: userTable.username,
      role: userTable.role,
      plan: userTable.plan,
      subscriptionStatus: userTable.subscriptionStatus,
      currentPeriodEnd: userTable.currentPeriodEnd,
      hasUsedTrial: userTable.hasUsedTrial,
      onboardingComplete: userTable.onboardingComplete,
      emailVerified: userTable.emailVerified,
      referralCode: userTable.referralCode,
      stripeCustomerId: userTable.stripeCustomerId,
      stripeSubscriptionId: userTable.stripeSubscriptionId,
      image: userTable.image,
      updatedAt: userTable.updatedAt,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .orderBy(desc(userTable.createdAt))
  return rows.map((r) => ({
    ...r,
    isPaying: r.subscriptionStatus === "active",
  }))
}

/** Single user's account details for the admin detail page. */
export async function getUserById(userId: string): Promise<AdminUser | null> {
  await requireAdmin()
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      username: userTable.username,
      role: userTable.role,
      plan: userTable.plan,
      subscriptionStatus: userTable.subscriptionStatus,
      currentPeriodEnd: userTable.currentPeriodEnd,
      hasUsedTrial: userTable.hasUsedTrial,
      onboardingComplete: userTable.onboardingComplete,
      emailVerified: userTable.emailVerified,
      referralCode: userTable.referralCode,
      stripeCustomerId: userTable.stripeCustomerId,
      stripeSubscriptionId: userTable.stripeSubscriptionId,
      image: userTable.image,
      updatedAt: userTable.updatedAt,
      createdAt: userTable.createdAt,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  const r = rows[0]
  if (!r) return null
  return { ...r, isPaying: r.subscriptionStatus === "active" }
}

export type UserBillingDetail = {
  invoices: {
    id: string
    amount: number
    currency: string
    status: string | null
    created: number
    hostedUrl: string | null
    pdfUrl: string | null
    description: string | null
  }[]
  renewalDate: number | null
  cancelAtPeriodEnd: boolean
  subscriptionStatus: string | null
  totalPaid: number
  error?: string
}

/**
 * Live billing history for a single user, pulled on demand from Stripe.
 * Includes paid invoices, the next renewal date, and lifetime amount paid.
 */
export async function getUserBilling(
  userId: string,
): Promise<UserBillingDetail> {
  await requireAdmin()
  const rows = await db
    .select({
      stripeCustomerId: userTable.stripeCustomerId,
      subscriptionStatus: userTable.subscriptionStatus,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)
  const u = rows[0]
  const empty: UserBillingDetail = {
    invoices: [],
    renewalDate: null,
    cancelAtPeriodEnd: false,
    subscriptionStatus: u?.subscriptionStatus ?? null,
    totalPaid: 0,
  }
  if (!u?.stripeCustomerId) return empty

  try {
    const [invoiceList, subs] = await Promise.all([
      stripe.invoices.list({ customer: u.stripeCustomerId, limit: 24 }),
      stripe.subscriptions.list({
        customer: u.stripeCustomerId,
        status: "all",
        limit: 1,
      }),
    ])

    const invoices = invoiceList.data.map((inv) => ({
      id: inv.id ?? "",
      amount: inv.amount_paid ?? inv.amount_due ?? 0,
      currency: (inv.currency ?? "usd").toUpperCase(),
      status: inv.status ?? null,
      created: inv.created,
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
      description:
        inv.lines?.data?.[0]?.description ?? inv.number ?? null,
    }))

    const totalPaid = invoiceList.data
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + (i.amount_paid ?? 0), 0)

    const sub = subs.data[0]
    const item = sub?.items?.data?.[0]
    return {
      invoices,
      renewalDate: item?.current_period_end ?? null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
      subscriptionStatus: sub?.status ?? u.subscriptionStatus ?? null,
      totalPaid,
    }
  } catch (error) {
    console.error("[v0] getUserBilling failed:", error)
    return { ...empty, error: "Could not load billing history from Stripe." }
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

// ----- Book catalog management (both in-app "VOXYFI" and affiliate titles) --

export type AdminBook = {
  id: number
  title: string
  author: string
  category: string
  description: string
  excerpt: string
  fulfillment: string
  isbn: string | null
  buyUrl: string | null
  sampleText: string | null
  priceInCents: number
  coverImageUrl: string | null
  coverColor: string
  accentColor: string
  featured: boolean
  published: boolean
  availability: string
  linkStatus: string
  linkCheckedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const adminBookColumns = {
  id: book.id,
  title: book.title,
  author: book.author,
  category: book.category,
  description: book.description,
  excerpt: book.excerpt,
  fulfillment: book.fulfillment,
  isbn: book.isbn,
  buyUrl: book.buyUrl,
  sampleText: book.sampleText,
  priceInCents: book.priceInCents,
  coverImageUrl: book.coverImageUrl,
  coverColor: book.coverColor,
  accentColor: book.accentColor,
  featured: book.featured,
  published: book.published,
  availability: book.availability,
  linkStatus: book.linkStatus,
  linkCheckedAt: book.linkCheckedAt,
  createdAt: book.createdAt,
  updatedAt: book.updatedAt,
}

export type CatalogSort =
  | "title"
  | "author"
  | "isbn"
  | "source"
  | "category"
  | "availability"
  | "status"
  | "updated"
  | "created"

export type CatalogQueryParams = {
  page?: number
  pageSize?: number
  q?: string
  source?: "all" | "in_app" | "affiliate"
  status?: "all" | "published" | "hidden"
  availability?: "all" | Availability
  // Link-health filter: "broken" = confirmed broken; "review" = broken OR
  // inconclusive (bot-blocked/timeout) links that a human should verify.
  link?: "all" | "broken" | "review"
  sort?: CatalogSort
  dir?: "asc" | "desc"
}

export type CatalogQueryResult = {
  rows: AdminBook[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

// Valid page sizes. Not exported (a "use server" file may only export async
// functions); the client keeps its own copy for the page-size selector.
const PAGE_SIZES = [25, 50, 100, 200]

/**
 * Server-side paginated / filtered / sorted catalog query. Built to scale to
 * thousands of titles: filtering, sorting and paging all run in Postgres (with
 * supporting indexes) instead of shipping the whole catalog to the client.
 */
export async function queryCatalogBooks(
  params: CatalogQueryParams = {},
): Promise<CatalogQueryResult> {
  await requireAdmin()

  const pageSize = PAGE_SIZES.includes(params.pageSize as number)
    ? (params.pageSize as number)
    : 50
  const page = Math.max(1, Math.floor(params.page ?? 1))

  const conditions: SQL[] = []

  if (params.source === "in_app" || params.source === "affiliate") {
    conditions.push(eq(book.fulfillment, params.source))
  }
  if (params.status === "published") conditions.push(eq(book.published, true))
  if (params.status === "hidden") conditions.push(eq(book.published, false))
  if (params.availability && params.availability !== "all") {
    conditions.push(eq(book.availability, params.availability))
  }
  if (params.link === "broken") {
    conditions.push(eq(book.linkStatus, "broken"))
  } else if (params.link === "review") {
    conditions.push(inArray(book.linkStatus, ["broken", "needs_review"]))
  }

  const q = (params.q ?? "").trim()
  if (q) {
    const like = `%${q}%`
    const search = or(
      ilike(book.title, like),
      ilike(book.author, like),
      ilike(book.isbn, like),
      ilike(book.category, like),
    )
    if (search) conditions.push(search)
  }

  const where = conditions.length ? and(...conditions) : undefined

  const dir = params.dir === "asc" ? asc : desc
  const sortColumn = (() => {
    switch (params.sort) {
      case "title":
        return book.title
      case "author":
        return book.author
      case "isbn":
        return book.isbn
      case "source":
        return book.fulfillment
      case "category":
        return book.category
      case "availability":
        return book.availability
      case "status":
        return book.published
      case "updated":
        return book.updatedAt
      default:
        return book.createdAt
    }
  })()

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(book)
    .where(where)

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)

  const rows = await db
    .select(adminBookColumns)
    .from(book)
    .where(where)
    // Stable secondary sort by id so pagination never repeats/skips rows.
    .orderBy(dir(sortColumn), desc(book.id))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize)

  return { rows, total, page: safePage, pageSize, pageCount }
}

/** Distinct categories for the filter dropdown (cheap, cached per request). */
export async function listBookCategories(): Promise<string[]> {
  await requireAdmin()
  const rows = await db
    .selectDistinct({ category: book.category })
    .from(book)
    .orderBy(asc(book.category))
  return rows.map((r) => r.category).filter(Boolean)
}

export type CatalogStats = {
  total: number
  /** Count per availability value (missing keys = 0). */
  byAvailability: Record<string, number>
  /** Affiliate titles whose link check returned a definitive 404/410. */
  brokenLinks: number
  /** Affiliate titles that are broken OR inconclusive (need a human look). */
  linksNeedingReview: number
  /** Titles with no cover image. */
  missingCover: number
  /** Affiliate titles with no ISBN (weakens the buy-link deep link). */
  missingIsbn: number
  /** Titles with an empty description or still in the default "General" bucket. */
  incompleteMetadata: number
  /** Most recent link-health check across the catalog, if ever run. */
  lastLinkCheck: Date | null
}

/**
 * Aggregate catalog health for the admin dashboard. All counts run in Postgres;
 * cheap enough to compute per request even at thousands of titles.
 */
export async function getCatalogStats(): Promise<CatalogStats> {
  await requireAdmin()

  const affiliate = eq(book.fulfillment, "affiliate")
  const noCover = or(isNull(book.coverImageUrl), eq(book.coverImageUrl, ""))
  const noIsbn = or(isNull(book.isbn), eq(book.isbn, ""))

  const [
    availRows,
    brokenLinks,
    linksNeedingReview,
    missingCover,
    missingIsbn,
    incompleteMetadata,
    lastCheckRow,
  ] = await Promise.all([
    db
      .select({ availability: book.availability, value: count() })
      .from(book)
      .groupBy(book.availability),
    db
      .select({ v: count() })
      .from(book)
      .where(and(affiliate, eq(book.linkStatus, "broken"))),
    db
      .select({ v: count() })
      .from(book)
      .where(and(affiliate, inArray(book.linkStatus, ["broken", "needs_review"]))),
    db.select({ v: count() }).from(book).where(noCover),
    db.select({ v: count() }).from(book).where(and(affiliate, noIsbn)),
    db
      .select({ v: count() })
      .from(book)
      .where(or(eq(book.description, ""), eq(book.category, "General"))),
    db
      .select({ v: sql<string | null>`max(${book.linkCheckedAt})` })
      .from(book),
  ])

  const byAvailability: Record<string, number> = {}
  let total = 0
  for (const r of availRows) {
    byAvailability[r.availability] = r.value
    total += r.value
  }

  const rawLast = lastCheckRow[0]?.v ?? null
  return {
    total,
    byAvailability,
    brokenLinks: brokenLinks[0]?.v ?? 0,
    linksNeedingReview: linksNeedingReview[0]?.v ?? 0,
    missingCover: missingCover[0]?.v ?? 0,
    missingIsbn: missingIsbn[0]?.v ?? 0,
    incompleteMetadata: incompleteMetadata[0]?.v ?? 0,
    lastLinkCheck: rawLast ? new Date(rawLast) : null,
  }
}

export type CommercialBookInput = {
  title: string
  author: string
  category?: string
  description: string
  excerpt: string
  sampleText: string
  isbn?: string | null
  buyUrl?: string | null
  coverImageUrl?: string | null
  coverColor?: string
  accentColor?: string
  featured?: boolean
  published?: boolean
  availability?: string
  priceInCents?: number
}

/**
 * Normalizes + validates form input. Validation depends on fulfillment:
 * affiliate titles must have a listenable sample and a way to build a buy link
 * (ISBN or explicit URL); in-app titles don't.
 */
function cleanBookInput(input: CommercialBookInput, fulfillment: string) {
  const title = input.title.trim()
  const author = input.author.trim()
  const description = input.description.trim()
  const excerpt = input.excerpt.trim()
  const sampleText = input.sampleText.trim()
  if (!title) throw new Error("Title is required.")
  if (!author) throw new Error("Author is required.")

  const isbn = (input.isbn || "").replace(/[^0-9Xx]/g, "") || null
  const buyUrl = (input.buyUrl || "").trim() || null

  if (fulfillment === "affiliate") {
    if (!sampleText) throw new Error("A listenable sample is required.")
    if (!isbn && !buyUrl) {
      throw new Error(
        "Provide an ISBN or an explicit buy URL for the partner store.",
      )
    }
  }

  const availability: Availability =
    input.availability && isAvailability(input.availability)
      ? input.availability
      : fulfillment === "affiliate"
        ? "affiliate_only"
        : DEFAULT_AVAILABILITY

  return {
    title,
    author,
    category: input.category?.trim() || "General",
    description: description || excerpt,
    excerpt: excerpt || sampleText.slice(0, 400) || description.slice(0, 400),
    sampleText: sampleText || null,
    isbn,
    buyUrl,
    coverImageUrl: (input.coverImageUrl || "").trim() || null,
    coverColor: input.coverColor?.trim() || "#1f3a5f",
    accentColor: input.accentColor?.trim() || "#f4b740",
    featured: Boolean(input.featured),
    published: input.published ?? true,
    availability,
    // Every write bumps updatedAt so "last updated" sorting is accurate.
    updatedAt: new Date(),
  }
}

/** Creates a commercial (affiliate) book. Never stores full copyrighted text. */
export async function createCommercialBook(input: CommercialBookInput) {
  const admin = await requireAdmin()
  try {
    const v = cleanBookInput(input, "affiliate")
    const [row] = await db
      .insert(book)
      .values({
        ...v,
        fulfillment: "affiliate",
        // Affiliate titles are not sold in-app, so price/content stay empty.
        priceInCents: 0,
        content: "",
      })
      .returning({ id: book.id })
    await logBookAudit(actorOf(admin), [
      {
        bookId: row?.id ?? null,
        bookTitle: v.title,
        action: "create",
        field: null,
        oldValue: null,
        newValue: `${v.title} by ${v.author} (Amazon)`,
      },
    ])
    revalidatePath("/app/books")
    revalidatePath("/admin/books")
    return { id: row?.id }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not create the book.",
    }
  }
}

/**
 * Updates an existing catalog title. Preserves its fulfillment mode and never
 * wipes an in-app title's full text; only in-app titles accept a price update.
 */
export async function updateBook(id: number, input: CommercialBookInput) {
  const admin = await requireAdmin()
  try {
    const [existing] = await db.select().from(book).where(eq(book.id, id)).limit(1)
    if (!existing) return { error: "Book not found." }

    const v = cleanBookInput(input, existing.fulfillment)
    const pricePatch =
      existing.fulfillment === "in_app" &&
      typeof input.priceInCents === "number"
        ? { priceInCents: Math.max(0, Math.round(input.priceInCents)) }
        : {}
    const patch = { ...v, ...pricePatch }

    await db.update(book).set(patch).where(eq(book.id, id))

    // Diff the tracked fields and record one audit entry per real change.
    await logBookAudit(
      actorOf(admin),
      diffBookChanges(id, v.title, existing, patch),
    )

    revalidatePath("/app/books")
    revalidatePath(`/app/books/${id}`)
    revalidatePath("/admin/books")
    return { success: true }
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Could not update the book.",
    }
  }
}

// ----- Bulk catalog operations -----

/** Publishes or unpublishes many titles at once (storefront visibility). */
export async function setBooksPublished(ids: number[], published: boolean) {
  const admin = await requireAdmin()
  const clean = ids.filter((n) => Number.isFinite(n))
  if (clean.length === 0) return { updated: 0 }

  // Snapshot titles + prior state so the log records only real changes.
  const before = await db
    .select({ id: book.id, title: book.title, published: book.published })
    .from(book)
    .where(inArray(book.id, clean))

  await db
    .update(book)
    .set({ published, updatedAt: new Date() })
    .where(inArray(book.id, clean))

  await logBookAudit(
    actorOf(admin),
    before
      .filter((b) => b.published !== published)
      .map((b) => ({
        bookId: b.id,
        bookTitle: b.title,
        action: published ? ("publish" as const) : ("unpublish" as const),
        field: "published",
        oldValue: b.published ? "Published" : "Hidden",
        newValue: published ? "Published" : "Hidden",
      })),
  )

  revalidatePath("/app/books")
  revalidatePath("/admin/books")
  return { updated: clean.length }
}

/** Sets the merchandising availability status for many titles at once. */
export async function setBooksAvailability(
  ids: number[],
  availability: string,
) {
  const admin = await requireAdmin()
  if (!isAvailability(availability)) return { updated: 0, error: "Bad status." }
  const clean = ids.filter((n) => Number.isFinite(n))
  if (clean.length === 0) return { updated: 0 }

  const before = await db
    .select({ id: book.id, title: book.title, availability: book.availability })
    .from(book)
    .where(inArray(book.id, clean))

  await db
    .update(book)
    .set({ availability, updatedAt: new Date() })
    .where(inArray(book.id, clean))

  await logBookAudit(
    actorOf(admin),
    before
      .filter((b) => b.availability !== availability)
      .map((b) => ({
        bookId: b.id,
        bookTitle: b.title,
        action: "availability" as const,
        field: "availability",
        oldValue: b.availability,
        newValue: availability,
      })),
  )

  revalidatePath("/app/books")
  revalidatePath("/admin/books")
  return { updated: clean.length }
}

/** Deletes many titles at once. Cascades to purchases/favorites by FK. */
export async function bulkDeleteBooks(ids: number[]) {
  const admin = await requireAdmin()
  const clean = ids.filter((n) => Number.isFinite(n))
  if (clean.length === 0) return { deleted: 0 }

  // Snapshot titles before deletion so the audit entry survives the removal.
  const before = await db
    .select({ id: book.id, title: book.title, author: book.author })
    .from(book)
    .where(inArray(book.id, clean))

  await db.delete(book).where(inArray(book.id, clean))

  await logBookAudit(
    actorOf(admin),
    before.map((b) => ({
      // bookId intentionally null — the row no longer exists.
      bookId: null,
      bookTitle: b.title,
      action: "delete" as const,
      field: null,
      oldValue: `${b.title} by ${b.author}`,
      newValue: null,
    })),
  )

  revalidatePath("/app/books")
  revalidatePath("/admin/books")
  return { deleted: clean.length }
}

/**
 * Re-pulls Open Library metadata for the selected titles (those with an ISBN)
 * and fills any BLANK fields — description, category, author, and cover — never
 * overwriting data an admin already curated. Returns how many rows changed.
 */
export async function refreshBooksMetadata(ids: number[]) {
  const admin = await requireAdmin()
  const clean = ids.filter((n) => Number.isFinite(n))
  if (clean.length === 0) return { updated: 0, skipped: 0 }

  const rows = await db
    .select({
      id: book.id,
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      description: book.description,
      category: book.category,
      coverImageUrl: book.coverImageUrl,
    })
    .from(book)
    .where(inArray(book.id, clean))

  let updated = 0
  let skipped = 0
  for (const r of rows) {
    if (!r.isbn) {
      skipped++
      continue
    }
    const meta = await fetchIsbnMetadata(r.isbn)
    if (!meta) {
      skipped++
      continue
    }
    const patch: Record<string, string> = {}
    if (!r.coverImageUrl && meta.coverImageUrl)
      patch.coverImageUrl = meta.coverImageUrl
    if ((!r.description || !r.description.trim()) && meta.description)
      patch.description = meta.description
    if ((!r.category || r.category === "General") && meta.category)
      patch.category = meta.category
    if ((!r.author || !r.author.trim()) && meta.author)
      patch.author = meta.author
    if (Object.keys(patch).length === 0) {
      skipped++
      continue
    }
    await db
      .update(book)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(book.id, r.id))

    // One audit entry per field filled from Open Library.
    await logBookAudit(
      actorOf(admin),
      Object.entries(patch).map(([field, newValue]) => ({
        bookId: r.id,
        bookTitle: r.title,
        action: "isbn_import" as const,
        field,
        oldValue: null,
        newValue: String(newValue),
      })),
    )
    updated++
  }

  revalidatePath("/app/books")
  revalidatePath("/admin/books")
  return { updated, skipped }
}

/**
 * Checks the affiliate buy links of the given titles (or, when no ids are
 * passed, a sweep of the affiliate titles with the oldest/never checks) and
 * records link health. Delegates to the shared, server-only implementation.
 */
export async function checkBookLinks(ids?: number[]) {
  const admin = await requireAdmin()
  const result = await runLinkCheck(ids)
  // A single summary entry per run keeps the log lightweight (vs one per book).
  await logBookAudit(actorOf(admin), [
    {
      bookId: null,
      bookTitle: `Link check (${result.checked} affiliate titles)`,
      action: "link_check",
      field: null,
      oldValue: null,
      newValue: `${result.ok} OK, ${result.broken} broken, ${result.unknown} need review`,
    },
  ])
  return result
}

// ----- Affiliate (Amazon) configuration -----

export type AffiliateConfig = {
  tag: string
  region: string
  tagSource: "setting" | "env" | "none"
  regions: { code: string; label: string }[]
}

/** Reads the effective Amazon Associate configuration for the settings page. */
export async function getAffiliateConfig(): Promise<AffiliateConfig> {
  await requireAdmin()
  const { tag, region, tagSource } = await resolveAffiliateSettings()
  return {
    tag,
    region,
    tagSource,
    regions: AMAZON_MARKETPLACES.map((m) => ({ code: m.code, label: m.label })),
  }
}

/** Saves the Amazon Associate tag + marketplace region (admin only). */
export async function saveAffiliateConfig(input: {
  tag: string
  region: string
}) {
  const admin = await requireAdmin()
  await saveAmazonTag(input.tag)
  await saveAmazonRegion(input.region)
  await logBookAudit(actorOf(admin), [
    {
      bookId: null,
      bookTitle: "Amazon affiliate settings",
      action: "settings",
      field: "amazon_associate",
      oldValue: null,
      newValue: `tag=${input.tag.trim() || "(cleared)"} region=${input.region}`,
    },
  ])
  return await getAffiliateConfig()
}

// ----- Book audit log (read-only viewer) -----

export type AuditLogRow = {
  id: number
  bookId: number | null
  bookTitle: string
  action: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  actorName: string
  actorEmail: string
  createdAt: Date
}

export type AuditQueryParams = {
  page?: number
  pageSize?: number
  q?: string
  action?: string
  actor?: string
}

export type AuditQueryResult = {
  rows: AuditLogRow[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

const AUDIT_PAGE_SIZES = [25, 50, 100, 200]

function buildAuditWhere(params: AuditQueryParams): SQL | undefined {
  const conditions: SQL[] = []
  if (params.action && params.action !== "all") {
    conditions.push(eq(bookAuditLog.action, params.action))
  }
  if (params.actor && params.actor !== "all") {
    conditions.push(eq(bookAuditLog.actorEmail, params.actor))
  }
  const q = (params.q ?? "").trim()
  if (q) {
    const like = `%${q}%`
    const search = or(
      ilike(bookAuditLog.bookTitle, like),
      ilike(bookAuditLog.actorName, like),
      ilike(bookAuditLog.actorEmail, like),
      ilike(bookAuditLog.field, like),
      ilike(bookAuditLog.oldValue, like),
      ilike(bookAuditLog.newValue, like),
    )
    if (search) conditions.push(search)
  }
  return conditions.length ? and(...conditions) : undefined
}

/** Paginated, filterable, searchable audit log. Newest first. */
export async function queryAuditLog(
  params: AuditQueryParams = {},
): Promise<AuditQueryResult> {
  await requireAdmin()

  const pageSize = AUDIT_PAGE_SIZES.includes(params.pageSize as number)
    ? (params.pageSize as number)
    : 50
  const page = Math.max(1, Math.floor(params.page ?? 1))
  const where = buildAuditWhere(params)

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(bookAuditLog)
    .where(where)

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, pageCount)

  const rows = await db
    .select({
      id: bookAuditLog.id,
      bookId: bookAuditLog.bookId,
      bookTitle: bookAuditLog.bookTitle,
      action: bookAuditLog.action,
      field: bookAuditLog.field,
      oldValue: bookAuditLog.oldValue,
      newValue: bookAuditLog.newValue,
      actorName: bookAuditLog.actorName,
      actorEmail: bookAuditLog.actorEmail,
      createdAt: bookAuditLog.createdAt,
    })
    .from(bookAuditLog)
    .where(where)
    .orderBy(desc(bookAuditLog.createdAt), desc(bookAuditLog.id))
    .limit(pageSize)
    .offset((safePage - 1) * pageSize)

  return { rows, total, page: safePage, pageSize, pageCount }
}

/** Distinct actors (by email) for the audit filter dropdown. */
export async function listAuditActors(): Promise<
  { email: string; name: string }[]
> {
  await requireAdmin()
  const rows = await db
    .selectDistinct({
      email: bookAuditLog.actorEmail,
      name: bookAuditLog.actorName,
    })
    .from(bookAuditLog)
    .orderBy(asc(bookAuditLog.actorName))
  return rows.filter((r) => r.email)
}

/**
 * Returns matching audit rows serialized as a CSV string (respecting the same
 * filters/search as the viewer), capped so an export can never run away.
 */
export async function exportAuditLogCsv(
  params: AuditQueryParams = {},
): Promise<string> {
  await requireAdmin()
  const where = buildAuditWhere(params)

  const rows = await db
    .select({
      createdAt: bookAuditLog.createdAt,
      action: bookAuditLog.action,
      bookId: bookAuditLog.bookId,
      bookTitle: bookAuditLog.bookTitle,
      field: bookAuditLog.field,
      oldValue: bookAuditLog.oldValue,
      newValue: bookAuditLog.newValue,
      actorName: bookAuditLog.actorName,
      actorEmail: bookAuditLog.actorEmail,
    })
    .from(bookAuditLog)
    .where(where)
    .orderBy(desc(bookAuditLog.createdAt), desc(bookAuditLog.id))
    .limit(10000)

  return auditRowsToCsv(rows)
}

type AuditCsvRow = {
  createdAt: Date
  action: string
  bookId: number | null
  bookTitle: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  actorName: string
  actorEmail: string
}

/** Serializes audit rows to a CSV string (RFC-4180 quoting). */
function auditRowsToCsv(rows: AuditCsvRow[]): string {
  const header = [
    "Timestamp",
    "Action",
    "Book ID",
    "Book",
    "Field",
    "Previous value",
    "New value",
    "User",
    "Email",
  ]
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    // Always quote; escape embedded quotes by doubling them.
    return `"${s.replace(/"/g, '""')}"`
  }
  const lines = [header.map(esc).join(",")]
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.action,
        r.bookId ?? "",
        r.bookTitle,
        r.field ?? "",
        r.oldValue ?? "",
        r.newValue ?? "",
        r.actorName,
        r.actorEmail,
      ]
        .map(esc)
        .join(","),
    )
  }
  return lines.join("\r\n")
}

// ----- Audit log retention policy -----

export type RetentionStats = {
  policy: AuditRetentionPolicy
  /** Total audit entries currently stored. */
  totalEntries: number
  /** Entries eligible for pruning under the current policy right now. */
  prunable: number
  /** The cutoff date (entries older than this are prunable). */
  cutoff: Date
  /** Timestamp of the oldest retained entry, if any. */
  oldestEntry: Date | null
}

/** Reads the retention policy plus live stats for the admin settings card. */
export async function getRetentionStats(): Promise<RetentionStats> {
  await requireAdmin()
  const policy = await getRetentionPolicy()
  const now = new Date()

  const [totalRow] = await db.select({ v: count() }).from(bookAuditLog)
  const [oldestRow] = await db
    .select({ v: sql<string | null>`min(${bookAuditLog.createdAt})` })
    .from(bookAuditLog)

  const prunable = await countPrunable(policy, now)
  const oldestRaw = oldestRow?.v ?? null

  return {
    policy,
    totalEntries: totalRow?.v ?? 0,
    prunable,
    cutoff: retentionCutoff(policy.months, now),
    oldestEntry: oldestRaw ? new Date(oldestRaw) : null,
  }
}

/** Updates the retention policy (admin only) and returns fresh stats. */
export async function updateRetentionPolicy(
  input: Partial<AuditRetentionPolicy>,
): Promise<RetentionStats> {
  const admin = await requireAdmin()
  const saved = await saveRetentionPolicy(input)
  // Record the configuration change itself as a permanent (critical) entry.
  await logBookAudit(actorOf(admin), [
    {
      bookId: null,
      bookTitle: "Audit retention policy",
      action: "retention_prune",
      field: "policy",
      oldValue: null,
      newValue: saved.enabled
        ? `Auto-prune ON · keep ${saved.months} months · exempt critical: ${saved.exemptCritical ? "yes" : "no"}`
        : `Auto-prune OFF · keep ${saved.months} months · exempt critical: ${saved.exemptCritical ? "yes" : "no"}`,
    },
  ])
  revalidatePath("/admin/audit")
  return getRetentionStats()
}

/**
 * Archival export of exactly the entries eligible for pruning right now, in
 * CSV or JSON. Intended to be downloaded BEFORE pruning.
 */
export async function exportPrunableAuditLog(
  format: "csv" | "json" = "csv",
): Promise<string> {
  await requireAdmin()
  const policy = await getRetentionPolicy()
  const rows = await fetchPrunable(policy)
  if (format === "json") {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        policy,
        cutoff: retentionCutoff(policy.months).toISOString(),
        count: rows.length,
        entries: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      null,
      2,
    )
  }
  return auditRowsToCsv(rows)
}

/**
 * Immediately prunes entries eligible under the current policy. This is
 * destructive; callers must confirm and are encouraged to export first. The
 * critical-event exemption still applies. Returns how many were removed.
 */
export async function pruneAuditLogNow(): Promise<{
  deleted: number
  stats: RetentionStats
}> {
  const admin = await requireAdmin()
  const policy = await getRetentionPolicy()
  const deleted = await prunePolicy(policy)
  if (deleted > 0) {
    // Permanent record of the prune (exempt from future pruning).
    await logBookAudit(actorOf(admin), [
      {
        bookId: null,
        bookTitle: "Audit log prune (manual)",
        action: "retention_prune",
        field: null,
        oldValue: null,
        newValue: `Pruned ${deleted} entries older than ${policy.months} months${policy.exemptCritical ? " (critical events kept)" : ""}`,
      },
    ])
  }
  revalidatePath("/admin/audit")
  return { deleted, stats: await getRetentionStats() }
}

export type IsbnMetadata = {
  title?: string
  author?: string
  description?: string
  category?: string
  coverImageUrl?: string
}

/**
 * Raw Open Library lookup by ISBN (free, no API key). Returns metadata only
 * (title/author/synopsis/cover) — never copyrighted body text. No auth check;
 * callers must gate access. Returns null when the ISBN is invalid/unresolved.
 */
async function fetchIsbnMetadata(rawIsbn: string): Promise<IsbnMetadata | null> {
  const isbn = (rawIsbn || "").replace(/[^0-9Xx]/g, "")
  if (isbn.length !== 10 && isbn.length !== 13) return null

  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const edition = (await res.json()) as Record<string, any>

    const data: IsbnMetadata = {
      title:
        typeof edition.title === "string" ? edition.title.trim() : undefined,
      coverImageUrl: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`,
    }

    const authorKey: string | undefined =
      edition.authors?.[0]?.key ?? edition.works?.[0]?.author?.key
    if (authorKey) {
      try {
        const aRes = await fetch(`https://openlibrary.org${authorKey}.json`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        })
        if (aRes.ok) {
          const a = (await aRes.json()) as Record<string, any>
          if (typeof a.name === "string") data.author = a.name.trim()
        }
      } catch {
        // Non-fatal.
      }
    }

    const workKey: string | undefined = edition.works?.[0]?.key
    if (workKey) {
      try {
        const wRes = await fetch(`https://openlibrary.org${workKey}.json`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        })
        if (wRes.ok) {
          const w = (await wRes.json()) as Record<string, any>
          const desc =
            typeof w.description === "string"
              ? w.description
              : w.description?.value
          if (typeof desc === "string" && desc.trim()) {
            data.description = desc.trim()
          }
          if (Array.isArray(w.subjects) && w.subjects.length > 0) {
            data.category = String(w.subjects[0]).trim()
          }
        }
      } catch {
        // Non-fatal.
      }
    }

    return data
  } catch {
    return null
  }
}

/**
 * Admin-facing ISBN lookup used by the create/edit form's "Fetch" button.
 * Wraps fetchIsbnMetadata with an auth check and friendly error strings.
 */
export async function lookupIsbnMetadata(
  rawIsbn: string,
): Promise<{ data?: IsbnMetadata; error?: string }> {
  await requireAdmin()
  const isbn = (rawIsbn || "").replace(/[^0-9Xx]/g, "")
  if (isbn.length !== 10 && isbn.length !== 13) {
    return { error: "Enter a valid 10- or 13-digit ISBN first." }
  }
  const data = await fetchIsbnMetadata(isbn)
  if (!data) return { error: "No book found for that ISBN on Open Library." }
  return { data }
}

// ----- Quality review queue -----

export type ReviewBook = {
  id: number
  title: string
  author: string
  language: string
  category: string
  description: string
  isbn: string | null
  publicationYear: number | null
  fulfillment: string
  coverImageUrl: string | null
  coverColor: string
  accentColor: string
  availability: string
  published: boolean
  qualityScore: number | null
  qualityReport: QualityReport | null
  duplicateOf: { id: number; title: string; author: string } | null
  createdAt: Date
}

/** Number of books currently quarantined in the review queue (nav badge). */
export async function getReviewCount(): Promise<number> {
  await requireAdmin()
  const [row] = await db
    .select({ v: count() })
    .from(book)
    .where(eq(book.availability, "needs_review"))
  return row?.v ?? 0
}

/**
 * Books held for quality review (availability = needs_review), worst score
 * first. Resolves each report's duplicate flag to the actual existing title.
 */
export async function getReviewQueue(): Promise<ReviewBook[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: book.id,
      title: book.title,
      author: book.author,
      language: book.language,
      category: book.category,
      description: book.description,
      isbn: book.isbn,
      publicationYear: book.publicationYear,
      fulfillment: book.fulfillment,
      coverImageUrl: book.coverImageUrl,
      coverColor: book.coverColor,
      accentColor: book.accentColor,
      availability: book.availability,
      published: book.published,
      qualityScore: book.qualityScore,
      qualityReport: book.qualityReport,
      createdAt: book.createdAt,
    })
    .from(book)
    .where(eq(book.availability, "needs_review"))
    .orderBy(asc(book.qualityScore), desc(book.createdAt))
    .limit(200)

  // Resolve duplicate references for any book whose report flagged a dupe.
  const out: ReviewBook[] = []
  for (const r of rows) {
    const report = (r.qualityReport as QualityReport | null) ?? null
    let duplicateOf: ReviewBook["duplicateOf"] = null
    if (report?.flags?.includes("duplicate")) {
      const key = dedupeKey(r.title, r.author)
      const [match] = await db
        .select({ id: book.id, title: book.title, author: book.author })
        .from(book)
        .where(
          and(
            ne(book.id, r.id),
            sql`lower(${book.title}) = lower(${r.title})`,
          ),
        )
        .limit(10)
      if (match && dedupeKey(match.title, match.author) === key) {
        duplicateOf = match
      }
    }
    out.push({ ...r, qualityReport: report, duplicateOf })
  }
  return out
}

/** Recomputes a book's quality score from its CURRENT (possibly edited) data. */
export async function recheckBookQuality(id: number) {
  await requireAdmin()
  const [b] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  if (!b) return { error: "Book not found." }

  // Duplicate check against other catalog entries with the same title.
  const key = dedupeKey(b.title, b.author)
  const titleMatches = await db
    .select({ id: book.id, title: book.title, author: book.author })
    .from(book)
    .where(and(ne(book.id, id), sql`lower(${book.title}) = lower(${b.title})`))
    .limit(20)
  const duplicateOf =
    titleMatches.find((m) => dedupeKey(m.title, m.author) === key)?.id ?? null

  const report = scoreBook({
    title: b.title,
    author: b.author,
    language: b.language,
    coverImageUrl: b.coverImageUrl,
    description: b.description,
    publicationYear: b.publicationYear,
    isbn: b.isbn,
    category: b.category,
    sample: `${b.title} ${(b.content || "").slice(0, 1200)}`,
    fulfillment: b.fulfillment === "affiliate" ? "affiliate" : "in_app",
    duplicateOf,
  })

  await db
    .update(book)
    .set({
      qualityScore: report.score,
      qualityReport: report,
      qualityCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(book.id, id))

  revalidatePath("/admin/review")
  return { report }
}

/**
 * Approves a quarantined book: makes it publicly visible (published +
 * available). Records a manual-override note on the stored report.
 */
export async function approveBook(id: number) {
  const admin = await requireAdmin()
  const [b] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  if (!b) return { error: "Book not found." }

  const report = (b.qualityReport as QualityReport | null) ?? null
  const patchedReport: QualityReport | null = report
    ? {
        ...report,
        verdict: "publish",
        summary: `Manually approved by ${actorOf(admin).name}. ${report.summary}`,
      }
    : null

  await db
    .update(book)
    .set({
      published: true,
      availability: "available",
      qualityReport: patchedReport ?? b.qualityReport,
      updatedAt: new Date(),
    })
    .where(eq(book.id, id))

  await logBookAudit(actorOf(admin), [
    {
      bookId: id,
      bookTitle: b.title,
      action: "publish",
      field: "availability",
      oldValue: b.availability,
      newValue: "available (approved)",
    },
  ])

  revalidatePath("/admin/review")
  revalidatePath("/admin/books")
  revalidatePath("/app/books")
  return { success: true }
}

export type ReviewCorrection = {
  title?: string
  author?: string
  language?: string
  category?: string
  description?: string
  coverImageUrl?: string | null
  isbn?: string | null
  publicationYear?: number | null
}

/**
 * Applies admin corrections to a quarantined book's metadata and re-scores it.
 * Does NOT change visibility — the admin still explicitly approves. Returns the
 * refreshed quality report so the UI can show whether the fixes clear the bar.
 */
export async function correctReviewBook(id: number, patch: ReviewCorrection) {
  const admin = await requireAdmin()
  const [b] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  if (!b) return { error: "Book not found." }

  const next = {
    title: patch.title?.trim() || b.title,
    author: patch.author?.trim() || b.author,
    language: patch.language?.trim() || b.language,
    category: patch.category?.trim() || b.category,
    description:
      patch.description !== undefined ? patch.description.trim() : b.description,
    coverImageUrl:
      patch.coverImageUrl !== undefined
        ? (patch.coverImageUrl || "").trim() || null
        : b.coverImageUrl,
    isbn:
      patch.isbn !== undefined
        ? (patch.isbn || "").replace(/[^0-9Xx]/g, "") || null
        : b.isbn,
    publicationYear:
      patch.publicationYear !== undefined
        ? patch.publicationYear
        : b.publicationYear,
  }

  if (!next.title.trim()) return { error: "Title cannot be empty." }

  // Re-run duplicate detection against other same-title entries.
  const key = dedupeKey(next.title, next.author)
  const titleMatches = await db
    .select({ id: book.id, title: book.title, author: book.author })
    .from(book)
    .where(and(ne(book.id, id), sql`lower(${book.title}) = lower(${next.title})`))
    .limit(20)
  const duplicateOf =
    titleMatches.find((m) => dedupeKey(m.title, m.author) === key)?.id ?? null

  const report = scoreBook({
    title: next.title,
    author: next.author,
    language: next.language,
    coverImageUrl: next.coverImageUrl,
    description: next.description,
    publicationYear: next.publicationYear,
    isbn: next.isbn,
    category: next.category,
    sample: `${next.title} ${(b.content || "").slice(0, 1200)}`,
    fulfillment: b.fulfillment === "affiliate" ? "affiliate" : "in_app",
    duplicateOf,
  })

  await db
    .update(book)
    .set({
      ...next,
      qualityScore: report.score,
      qualityReport: report,
      qualityCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(book.id, id))

  // Record real field changes for the audit trail.
  await logBookAudit(
    actorOf(admin),
    diffBookChanges(id, next.title, b, next),
  )

  revalidatePath("/admin/review")
  revalidatePath("/admin/books")
  return { report }
}

/** Keeps a book quarantined (explicit reject): unpublished + needs_review. */
export async function rejectBook(id: number) {
  const admin = await requireAdmin()
  const [b] = await db.select().from(book).where(eq(book.id, id)).limit(1)
  if (!b) return { error: "Book not found." }

  await db
    .update(book)
    .set({
      published: false,
      availability: "needs_review",
      updatedAt: new Date(),
    })
    .where(eq(book.id, id))

  await logBookAudit(actorOf(admin), [
    {
      bookId: id,
      bookTitle: b.title,
      action: "unpublish",
      field: "availability",
      oldValue: b.availability,
      newValue: "needs_review (rejected)",
    },
  ])

  revalidatePath("/admin/review")
  return { success: true }
}
