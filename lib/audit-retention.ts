import "server-only"

import { and, count, desc, eq, lt, notInArray, type SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import { appSetting, bookAuditLog } from "@/lib/db/schema"

/**
 * Audit-log retention policy. Persisted as a JSON blob in `app_setting` under
 * SETTING_KEY. `enabled` controls automatic (cron) pruning; the admin can turn
 * it off entirely. `exemptCritical` keeps security/administrative events
 * (create/delete/publish/unpublish + the prune records themselves) forever.
 */
export type AuditRetentionPolicy = {
  enabled: boolean
  months: number
  exemptCritical: boolean
}

export const SETTING_KEY = "audit_retention"

export const DEFAULT_POLICY: AuditRetentionPolicy = {
  enabled: true,
  months: 24,
  exemptCritical: true,
}

// Selectable retention windows (months) offered in the admin UI.
export const RETENTION_MONTH_OPTIONS = [3, 6, 12, 18, 24, 36, 48, 60]

/**
 * Actions considered critical security/administrative events. When
 * `exemptCritical` is on, these are never auto-pruned. `retention_prune` is
 * included so the prune audit trail is itself permanent.
 */
export const CRITICAL_ACTIONS = [
  "create",
  "delete",
  "publish",
  "unpublish",
  "retention_prune",
]

function clampMonths(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_POLICY.months
  // 1 month floor, 120 month (10y) ceiling.
  return Math.min(120, Math.max(1, v))
}

/** Reads the persisted policy, falling back to defaults for missing fields. */
export async function getRetentionPolicy(): Promise<AuditRetentionPolicy> {
  try {
    const [row] = await db
      .select({ value: appSetting.value })
      .from(appSetting)
      .where(eq(appSetting.key, SETTING_KEY))
      .limit(1)
    if (!row) return { ...DEFAULT_POLICY }
    const parsed = JSON.parse(row.value) as Partial<AuditRetentionPolicy>
    return {
      enabled: parsed.enabled ?? DEFAULT_POLICY.enabled,
      months: clampMonths(parsed.months),
      exemptCritical: parsed.exemptCritical ?? DEFAULT_POLICY.exemptCritical,
    }
  } catch {
    return { ...DEFAULT_POLICY }
  }
}

/** Persists a validated policy (upsert on the single settings key). */
export async function saveRetentionPolicy(
  input: Partial<AuditRetentionPolicy>,
): Promise<AuditRetentionPolicy> {
  const current = await getRetentionPolicy()
  const next: AuditRetentionPolicy = {
    enabled: input.enabled ?? current.enabled,
    months: clampMonths(input.months ?? current.months),
    exemptCritical: input.exemptCritical ?? current.exemptCritical,
  }
  const value = JSON.stringify(next)
  await db
    .insert(appSetting)
    .values({ key: SETTING_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSetting.key,
      set: { value, updatedAt: new Date() },
    })
  return next
}

/** The cutoff date: entries strictly older than this are eligible to prune. */
export function retentionCutoff(months: number, now = new Date()): Date {
  const d = new Date(now)
  d.setMonth(d.getMonth() - clampMonths(months))
  return d
}

/**
 * Builds the WHERE condition selecting prunable rows for a policy: older than
 * the cutoff, and (when exemptCritical) excluding critical action categories.
 */
export function prunableWhere(
  policy: AuditRetentionPolicy,
  now = new Date(),
): SQL {
  const cutoff = retentionCutoff(policy.months, now)
  const conditions: SQL[] = [lt(bookAuditLog.createdAt, cutoff)]
  if (policy.exemptCritical) {
    conditions.push(notInArray(bookAuditLog.action, CRITICAL_ACTIONS))
  }
  return and(...conditions) as SQL
}

/** Count of entries currently eligible for pruning under the policy. */
export async function countPrunable(
  policy: AuditRetentionPolicy,
  now = new Date(),
): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(bookAuditLog)
    .where(prunableWhere(policy, now))
  return value
}

export type PrunableRow = {
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

/** Fetches the prunable rows (for archival export), capped for safety. */
export async function fetchPrunable(
  policy: AuditRetentionPolicy,
  now = new Date(),
  limit = 100000,
): Promise<PrunableRow[]> {
  return db
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
    .where(prunableWhere(policy, now))
    .orderBy(desc(bookAuditLog.createdAt), desc(bookAuditLog.id))
    .limit(limit)
}

/** Deletes prunable rows. Returns how many were removed. */
export async function prunePolicy(
  policy: AuditRetentionPolicy,
  now = new Date(),
): Promise<number> {
  const before = await countPrunable(policy, now)
  if (before === 0) return 0
  await db.delete(bookAuditLog).where(prunableWhere(policy, now))
  return before
}
