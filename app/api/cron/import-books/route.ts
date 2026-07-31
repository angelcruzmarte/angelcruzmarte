import { importNewBooks } from "@/lib/import-books"
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
// Imports download full book texts over the network; give the function room.
export const maxDuration = 300

/**
 * Scheduled native-store importer. Each run adds up to IMPORT_MAX_PER_RUN new
 * public-domain titles from Project Gutenberg's live catalog feed, distributed
 * across the supported languages, and publishes them immediately. Idempotent:
 * titles already in the catalog are skipped, so re-running only ever adds what
 * is newly available. Secret-gated like the other crons.
 */
export async function GET(req: Request) {
  const startedAt = Date.now()

  const unauthorized = authorizeCron(req)
  if (unauthorized) return unauthorized

  try {
    const limit = Number(process.env.IMPORT_MAX_PER_RUN) || 100
    const result = await importNewBooks({ limit, autoPublish: true })

    if (result.added > 0) {
      const breakdown = Object.entries(result.byLanguage)
        .sort((a, b) => b[1] - a[1])
        .map(([lang, n]) => `${lang}:${n}`)
        .join(", ")
      await logBookAudit(SYSTEM_ACTOR, [
        {
          bookId: null,
          bookTitle: `Auto-import (${result.added} new titles)`,
          action: "import",
          field: null,
          oldValue: null,
          newValue: breakdown
            ? `Published ${result.added} public-domain titles — ${breakdown}`
            : `Published ${result.added} public-domain titles`,
        },
      ])
    }

    const summary = {
      success: true,
      ...result,
      // Keep the response compact; titles can be long.
      titles: result.titles.slice(0, 25),
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron import-books summary:", JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err) {
    const summary = {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron import-books FAILED:", JSON.stringify(summary))
    return NextResponse.json(summary, { status: 500 })
  }
}
