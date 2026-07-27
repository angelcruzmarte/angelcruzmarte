import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { generateAndStoreDocumentThumbnail } from "@/lib/document-thumbnail"
import { and, desc, isNotNull, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"

// Rendering PDFs for a batch of documents can take a while.
export const maxDuration = 300
export const dynamic = "force-dynamic"

// How many documents to process per invocation. Kept modest so a single run
// stays well under maxDuration even when every candidate is a large PDF; the
// cron runs regularly, so any remainder is picked up on the next pass.
const BATCH_SIZE = 25
// Per-document download attempts before giving up (with linear backoff).
const MAX_ATTEMPTS = 3
const MAX_BYTES = 15 * 1024 * 1024 // 15MB, matches the import route.

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Fetches the original file bytes with retry + linear backoff. */
async function fetchWithRetry(url: string): Promise<Buffer | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { redirect: "follow" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const declared = Number(res.headers.get("content-length") ?? "0")
      if (declared && declared > MAX_BYTES) {
        // Too big to render — don't waste further attempts.
        return null
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.byteLength > MAX_BYTES) return null
      return buf
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) {
        console.log(
          `[v0] cron backfill fetch failed after ${attempt} attempts:`,
          err instanceof Error ? err.message : String(err),
        )
        return null
      }
      await sleep(attempt * 500)
    }
  }
  return null
}

/**
 * Scheduled safety-net backfill. Finds documents that still lack a cover but
 * have retrievable original bytes and runs them through the one shared
 * thumbnail pipeline. Idempotent, retry-guarded, and self-monitoring: it emits
 * a structured summary (counts + timing) both to the logs and the response so
 * runs can be inspected in the Vercel cron dashboard.
 */
export async function GET(req: Request) {
  const startedAt = Date.now()

  // Auth: Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`
  // when CRON_SECRET is set. Reject anything that doesn't match so the endpoint
  // can't be triggered by the public.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const authHeader = req.headers.get("authorization")
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  let scanned = 0
  let generated = 0
  let skipped = 0
  let failed = 0

  try {
    const candidates = await db
      .select({
        id: document.id,
        userId: document.userId,
        title: document.title,
        originalUrl: document.originalUrl,
        originalMime: document.originalMime,
      })
      .from(document)
      .where(
        and(
          isNull(document.thumbnailUrl),
          isNull(document.deletedAt),
          isNotNull(document.originalUrl),
        ),
      )
      .orderBy(desc(document.id))
      .limit(BATCH_SIZE)

    scanned = candidates.length

    for (const doc of candidates) {
      const url = doc.originalUrl
      if (!url) {
        skipped++
        continue
      }
      const buffer = await fetchWithRetry(url)
      if (!buffer) {
        failed++
        continue
      }
      const result = await generateAndStoreDocumentThumbnail({
        userId: doc.userId,
        docId: doc.id,
        buffer,
        name: doc.title,
        mimeType: doc.originalMime,
      })
      if (result) generated++
      else skipped++
    }

    const summary = {
      ok: true,
      scanned,
      generated,
      skipped,
      failed,
      batchSize: BATCH_SIZE,
      hasMore: scanned === BATCH_SIZE,
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log("[v0] cron backfill-thumbnails summary:", JSON.stringify(summary))
    return NextResponse.json(summary)
  } catch (err) {
    const summary = {
      ok: false,
      scanned,
      generated,
      skipped,
      failed,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      ranAt: new Date().toISOString(),
    }
    console.log(
      "[v0] cron backfill-thumbnails FAILED:",
      JSON.stringify(summary),
    )
    return NextResponse.json(summary, { status: 500 })
  }
}
