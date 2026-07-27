import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { and, isNull, isNotNull, sql } from "drizzle-orm"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// A cloud document is considered "stale" (worth re-checking on the user's next
// connect) once it hasn't been synced in this many hours.
const STALE_HOURS = 24

/**
 * Scheduled cloud delta-sync heartbeat + monitor.
 *
 * IMPORTANT scope note: re-fetching a file from Google Drive / OneDrive /
 * Dropbox requires that user's OAuth access token. Those tokens are short-lived
 * and are only obtained client-side by the file picker — they are deliberately
 * never persisted server-side — so a background cron cannot itself pull changed
 * bytes for token-gated providers. The ACTUAL re-import happens client-side:
 * the moment a user opens the picker (fresh token in hand) we reconcile their
 * tracked files and re-import any that changed, in place.
 *
 * This cron therefore does what a server can do safely and usefully: it reports
 * sync coverage and staleness per provider as a structured, monitorable summary
 * (visible in the Vercel cron dashboard + logs), so drift is observable and
 * this endpoint is the ready hook point if durable offline tokens are added
 * later. Idempotent and read-only.
 */
export async function GET(req: Request) {
  const startedAt = Date.now()

  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const staleBefore = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000)

    // Per-provider counts: total tracked vs. stale (never synced or overdue).
    const rows = await db
      .select({
        provider: document.cloudProvider,
        total: sql<number>`count(*)::int`,
        stale: sql<number>`count(*) filter (
          where ${document.lastSyncedAt} is null
             or ${document.lastSyncedAt} < ${staleBefore}
        )::int`,
      })
      .from(document)
      .where(
        and(isNotNull(document.cloudProvider), isNull(document.deletedAt)),
      )
      .groupBy(document.cloudProvider)

    const byProvider = Object.fromEntries(
      rows.map((r) => [
        r.provider ?? "unknown",
        { total: Number(r.total), stale: Number(r.stale) },
      ]),
    )
    const totals = rows.reduce(
      (acc, r) => {
        acc.tracked += Number(r.total)
        acc.stale += Number(r.stale)
        return acc
      },
      { tracked: 0, stale: 0 },
    )

    const summary = {
      ok: true,
      tracked: totals.tracked,
      stale: totals.stale,
      staleHours: STALE_HOURS,
      byProvider,
      // Re-fetching token-gated providers requires a live user token, so the
      // actual re-import runs client-side on the user's next picker connect.
      note: "Client-side reconcile performs the re-import on next connect.",
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron sync-cloud summary:", JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err) {
    const summary = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron sync-cloud FAILED:", JSON.stringify(summary))
    return NextResponse.json(summary, { status: 500 })
  }
}
