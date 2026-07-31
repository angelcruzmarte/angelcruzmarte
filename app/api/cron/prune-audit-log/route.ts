import { getRetentionPolicy, prunePolicy } from "@/lib/audit-retention"
import { logBookAudit } from "@/lib/book-audit"
import { authorizeCron } from "@/lib/cron-auth"
import { NextResponse } from "next/server"

// System actor for scheduled (unattended) runs.
const SYSTEM_ACTOR = {
  id: "system",
  name: "Scheduled job",
  email: "cron@voxyfi.com",
}

export const dynamic = "force-dynamic"

/**
 * Scheduled audit-log retention prune. Reads the admin-configured policy; if
 * automatic pruning is disabled, it no-ops. Otherwise it deletes entries older
 * than the retention window, keeping critical/administrative events when the
 * policy exempts them, and records a permanent summary entry. Secret-gated.
 *
 * Note: automatic pruning is destructive. Admins can export eligible entries to
 * CSV/JSON from the audit page before they age out, and can disable this
 * entirely from the retention policy card.
 */
export async function GET(req: Request) {
  const startedAt = Date.now()

  const unauthorized = authorizeCron(req)
  if (unauthorized) return unauthorized

  try {
    const policy = await getRetentionPolicy()

    if (!policy.enabled) {
      const summary = {
        success: true,
        skipped: true,
        reason: "Automatic pruning disabled by policy",
        policy,
        ranAt: new Date().toISOString(),
      }
      console.log("[v0] cron prune-audit-log skipped:", JSON.stringify(summary))
      return NextResponse.json(summary)
    }

    const deleted = await prunePolicy(policy)
    if (deleted > 0) {
      await logBookAudit(SYSTEM_ACTOR, [
        {
          bookId: null,
          bookTitle: "Audit log prune (scheduled)",
          action: "retention_prune",
          field: null,
          oldValue: null,
          newValue: `Pruned ${deleted} entries older than ${policy.months} months${policy.exemptCritical ? " (critical events kept)" : ""}`,
        },
      ])
    }

    const summary = {
      success: true,
      deleted,
      policy,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron prune-audit-log summary:", JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err) {
    const summary = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron prune-audit-log FAILED:", JSON.stringify(summary))
    return NextResponse.json(summary, { status: 500 })
  }
}
