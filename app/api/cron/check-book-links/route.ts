import { runLinkCheck } from "@/lib/book-link-check"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
// Link checks make outbound requests; give the function room.
export const maxDuration = 300

/**
 * Scheduled affiliate buy-link health check. Sweeps the affiliate titles whose
 * links were checked longest ago (or never), verifies each Bookshop.org link,
 * and records link health — flipping broken ones to "needs review" so they
 * surface in the admin catalog filter. Secret-gated and idempotent.
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
    // Cap per run so a large catalog is covered gradually across days.
    const result = await runLinkCheck(undefined, 150)
    const summary = {
      success: true,
      ...result,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron check-book-links summary:", JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err) {
    const summary = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron check-book-links FAILED:", JSON.stringify(summary))
    return NextResponse.json(summary, { status: 500 })
  }
}
