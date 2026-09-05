"use server"

import { db } from "@/lib/db"
import {
  book,
  bookRating,
  contentReport,
  moderationLog,
  user as userTable,
} from "@/lib/db/schema"
import { getCurrentUser, isAdmin } from "@/lib/session"
import {
  CONTENT_TYPE_BOOK_REVIEW,
  REPORT_STATUSES,
  USER_STATUSES,
  type ReportStatus,
  type UserStatus,
} from "@/lib/moderation"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { revalidatePath } from "next/cache"

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!isAdmin(user)) throw new Error("Forbidden")
  return user!
}

/** Appends a moderation audit entry with a snapshot of the acting admin. */
async function logModeration(
  actor: { id: string; name: string; email: string },
  entry: {
    action: string
    targetType?: string
    targetId?: string
    targetUserId?: string
    note?: string
  },
) {
  await db.insert(moderationLog).values({
    actorId: actor.id,
    actorName: actor.name,
    actorEmail: actor.email,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    targetUserId: entry.targetUserId ?? null,
    note: entry.note ?? null,
  })
}

export type ModerationReport = {
  id: number
  reason: string
  details: string | null
  status: string
  createdAt: string
  reporter: { id: string; name: string; email: string } | null
  reportedUser: {
    id: string
    name: string
    email: string
    status: string
  } | null
  content: {
    type: string
    id: string
    bookId: number | null
    bookTitle: string | null
    text: string | null
    hidden: boolean
    exists: boolean
  }
}

/**
 * Reports for the admin moderation queue, newest first, optionally filtered by
 * status. Enriches each report with the reporter, the reported user (incl.
 * their account status), and a preview of the reported content. Admin-only.
 */
export async function queryReports({
  status = "all",
  page = 1,
  pageSize = 50,
}: {
  status?: string
  page?: number
  pageSize?: number
} = {}): Promise<{
  rows: ModerationReport[]
  total: number
  counts: Record<string, number>
}> {
  await requireAdmin()

  const reporter = alias(userTable, "reporter")
  const reported = alias(userTable, "reported")

  const whereStatus =
    status !== "all" && REPORT_STATUSES.includes(status as ReportStatus)
      ? eq(contentReport.status, status)
      : undefined

  const offset = (Math.max(1, page) - 1) * pageSize

  const [rows, [{ total }], statusRows] = await Promise.all([
    db
      .select({
        id: contentReport.id,
        reason: contentReport.reason,
        details: contentReport.details,
        status: contentReport.status,
        createdAt: contentReport.createdAt,
        contentType: contentReport.contentType,
        contentId: contentReport.contentId,
        reporterId: reporter.id,
        reporterName: reporter.name,
        reporterEmail: reporter.email,
        reportedId: reported.id,
        reportedName: reported.name,
        reportedEmail: reported.email,
        reportedStatus: reported.status,
      })
      .from(contentReport)
      .leftJoin(reporter, eq(reporter.id, contentReport.reporterId))
      .leftJoin(reported, eq(reported.id, contentReport.reportedUserId))
      .where(whereStatus)
      .orderBy(desc(contentReport.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(contentReport)
      .where(whereStatus),
    db
      .select({
        status: contentReport.status,
        n: sql<number>`count(*)::int`,
      })
      .from(contentReport)
      .groupBy(contentReport.status),
  ])

  // Enrich book_review content with the review text + book title in one batch.
  const reviewIds = rows
    .filter((r) => r.contentType === CONTENT_TYPE_BOOK_REVIEW)
    .map((r) => Number(r.contentId))
    .filter((n) => Number.isInteger(n))

  const reviewsById = new Map<
    number,
    { text: string | null; hidden: boolean; bookId: number; bookTitle: string | null }
  >()
  if (reviewIds.length > 0) {
    const reviewRows = await db
      .select({
        id: bookRating.id,
        text: bookRating.review,
        hidden: bookRating.hidden,
        bookId: bookRating.bookId,
        bookTitle: book.title,
      })
      .from(bookRating)
      .leftJoin(book, eq(book.id, bookRating.bookId))
      .where(inArray(bookRating.id, reviewIds))
    for (const r of reviewRows) {
      reviewsById.set(r.id, {
        text: r.text,
        hidden: r.hidden,
        bookId: r.bookId,
        bookTitle: r.bookTitle,
      })
    }
  }

  const counts: Record<string, number> = {}
  for (const s of statusRows) counts[s.status] = s.n

  const mapped: ModerationReport[] = rows.map((r) => {
    const rev =
      r.contentType === CONTENT_TYPE_BOOK_REVIEW
        ? reviewsById.get(Number(r.contentId))
        : undefined
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reporter: r.reporterId
        ? { id: r.reporterId, name: r.reporterName!, email: r.reporterEmail! }
        : null,
      reportedUser: r.reportedId
        ? {
            id: r.reportedId,
            name: r.reportedName!,
            email: r.reportedEmail!,
            status: r.reportedStatus!,
          }
        : null,
      content: {
        type: r.contentType,
        id: r.contentId,
        bookId: rev?.bookId ?? null,
        bookTitle: rev?.bookTitle ?? null,
        text: rev?.text ?? null,
        hidden: rev?.hidden ?? false,
        exists: rev != null,
      },
    }
  })

  return { rows: mapped, total, counts }
}

/** Moves a report through its lifecycle (pending/reviewed/resolved/dismissed). */
export async function updateReportStatus(reportId: number, status: string) {
  const admin = await requireAdmin()
  if (!REPORT_STATUSES.includes(status as ReportStatus)) {
    return { error: "Invalid status." }
  }
  const id = Number(reportId)
  if (!Number.isInteger(id)) return { error: "Invalid report." }

  await db
    .update(contentReport)
    .set({ status, updatedAt: new Date() })
    .where(eq(contentReport.id, id))

  await logModeration(admin, {
    action: "report_status_change",
    targetType: "report",
    targetId: String(id),
    note: `Status set to ${status}`,
  })
  revalidatePath("/admin/moderation")
  return { ok: true as const }
}

/** Hides or unhides a reported review so it is withheld from all readers. */
export async function setReviewHidden(reviewId: number, hidden: boolean) {
  const admin = await requireAdmin()
  const id = Number(reviewId)
  if (!Number.isInteger(id)) return { error: "Invalid review." }

  const [row] = await db
    .select({ userId: bookRating.userId, bookId: bookRating.bookId })
    .from(bookRating)
    .where(eq(bookRating.id, id))
    .limit(1)
  if (!row) return { error: "That review no longer exists." }

  await db
    .update(bookRating)
    .set({
      hidden,
      hiddenReason: hidden ? "Hidden by moderator" : null,
      updatedAt: new Date(),
    })
    .where(eq(bookRating.id, id))

  await logModeration(admin, {
    action: hidden ? "hide_content" : "unhide_content",
    targetType: CONTENT_TYPE_BOOK_REVIEW,
    targetId: String(id),
    targetUserId: row.userId,
  })
  revalidatePath("/admin/moderation")
  revalidatePath(`/app/books/${row.bookId}`)
  return { ok: true as const }
}

/** Suspends, restricts, or reinstates an account. Cannot target yourself. */
export async function setUserStatus(
  userId: string,
  status: string,
  reason?: string,
) {
  const admin = await requireAdmin()
  if (!USER_STATUSES.includes(status as UserStatus)) {
    return { error: "Invalid status." }
  }
  const target = String(userId ?? "")
  if (!target) return { error: "Invalid user." }
  if (target === admin.id) {
    return { error: "You can't change your own account status." }
  }

  const [row] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, target))
    .limit(1)
  if (!row) return { error: "That user no longer exists." }

  await db
    .update(userTable)
    .set({
      status,
      statusReason: (reason ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(userTable.id, target))

  const action =
    status === "suspended"
      ? "suspend_user"
      : status === "restricted"
        ? "restrict_user"
        : "reinstate_user"
  await logModeration(admin, {
    action,
    targetType: "user",
    targetUserId: target,
    note: (reason ?? "").trim() || undefined,
  })
  revalidatePath("/admin/moderation")
  return { ok: true as const }
}

export type ModerationLogRow = {
  id: number
  actorName: string
  actorEmail: string
  action: string
  targetType: string | null
  targetId: string | null
  targetUserId: string | null
  note: string | null
  createdAt: string
}

/** Append-only moderation audit trail, newest first. Admin-only. */
export async function queryModerationLog({
  page = 1,
  pageSize = 100,
}: { page?: number; pageSize?: number } = {}): Promise<ModerationLogRow[]> {
  await requireAdmin()
  const offset = (Math.max(1, page) - 1) * pageSize
  const rows = await db
    .select()
    .from(moderationLog)
    .orderBy(desc(moderationLog.createdAt))
    .limit(pageSize)
    .offset(offset)
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    actorEmail: r.actorEmail,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    targetUserId: r.targetUserId,
    note: r.note,
    createdAt: r.createdAt.toISOString(),
  }))
}
