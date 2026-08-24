import { NextResponse } from "next/server"
import { authorizeCron } from "@/lib/cron-auth"
import { importNewBooks } from "@/lib/import-books"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * TEMPORARY one-shot bulk importer. Calls the shared import core once with a
 * large limit so a single invocation adds as many new public-domain titles as
 * possible, instead of many rate-limited HTTP round-trips. Secret-gated exactly
 * like the scheduled import cron. Safe to delete after the catalog is filled.
 */
export async function GET(request: Request) {
  const unauthorized = authorizeCron(request)
  if (unauthorized) return unauthorized

  const { searchParams } = new URL(request.url)
  const limit = Math.min(
    5000,
    Math.max(1, Number(searchParams.get("limit")) || 2000),
  )

  const started = Date.now()
  const result = await importNewBooks({ limit, autoPublish: true })

  return NextResponse.json({
    ...result,
    limit,
    durationMs: Date.now() - started,
  })
}
