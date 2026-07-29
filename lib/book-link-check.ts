import "server-only"

import { db } from "@/lib/db"
import { book } from "@/lib/db/schema"
import { and, asc, eq, inArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { bookshopBuyUrl } from "@/lib/book-stores"

/**
 * Checks affiliate buy links and records link health. Shared by the admin
 * action (which adds an auth gate) and the cron route (secret-gated). No auth
 * check here — callers MUST gate access.
 *
 * A broken/unreachable link marks the title linkStatus="broken" and flips
 * availability to "needs_review" (only when it was on an automatic status, so a
 * deliberate "unavailable"/"coming_soon" is never stomped). A healthy link
 * marks linkStatus="ok" and leaves availability alone. In-app (VOXYFI) titles
 * have no external link and are never selected.
 *
 * When `ids` is empty it sweeps the affiliate titles with the oldest/never
 * checks first, capped at `max`, so a daily cron gradually covers the catalog.
 */
export async function runLinkCheck(ids?: number[], max = 100) {
  const clean = (ids ?? []).filter((n) => Number.isFinite(n))

  const rows = await db
    .select({
      id: book.id,
      title: book.title,
      author: book.author,
      isbn: book.isbn,
      buyUrl: book.buyUrl,
      availability: book.availability,
    })
    .from(book)
    .where(
      clean.length
        ? and(eq(book.fulfillment, "affiliate"), inArray(book.id, clean))
        : eq(book.fulfillment, "affiliate"),
    )
    .orderBy(asc(book.linkCheckedAt))
    .limit(clean.length ? clean.length : max)

  let ok = 0
  let broken = 0
  let unknown = 0
  const now = new Date()

  // Small concurrency to be gentle on the partner store.
  const BATCH = 5
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (r) => {
        const url = bookshopBuyUrl({
          title: r.title,
          author: r.author,
          isbn: r.isbn,
          buyUrl: r.buyUrl,
        })
        const verdict = await checkUrl(url)

        if (verdict === "ok") {
          ok++
          await db
            .update(book)
            .set({ linkStatus: "ok", linkCheckedAt: now })
            .where(eq(book.id, r.id))
        } else if (verdict === "broken") {
          broken++
          await db
            .update(book)
            .set({
              linkStatus: "broken",
              linkCheckedAt: now,
              // Only auto-flag titles on an automatic status so a deliberate
              // "unavailable"/"coming_soon"/etc. is never overwritten.
              ...(r.availability === "available" ||
              r.availability === "affiliate_only"
                ? { availability: "needs_review" }
                : {}),
            })
            .where(eq(book.id, r.id))
        } else {
          // Inconclusive (bot-blocked / timeout / network). Record that we
          // tried and mark for human review WITHOUT calling it broken, so we
          // never hide a title on a false positive.
          unknown++
          await db
            .update(book)
            .set({ linkStatus: "needs_review", linkCheckedAt: now })
            .where(eq(book.id, r.id))
        }
      }),
    )
  }

  revalidatePath("/admin/books")
  return { checked: rows.length, ok, broken, unknown }
}

type LinkVerdict = "ok" | "broken" | "unknown"

/**
 * Classifies a buy link. Bookshop.org (like many retailers) blocks datacenter
 * traffic with 403/429, so a plain "status < 400" check produces false
 * positives from serverless. We therefore treat only a definitive 404/410 as
 * genuinely broken; 2xx/3xx as ok; and everything else (403/429/5xx/timeout/
 * network error) as "unknown" — surfaced for review but never auto-hidden.
 */
async function checkUrl(url: string): Promise<LinkVerdict> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      // Browser-like headers reduce bot-blocking on the partner store.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    })
    if (res.status === 404 || res.status === 410) return "broken"
    if (res.status < 400) return "ok"
    return "unknown"
  } catch {
    return "unknown"
  } finally {
    clearTimeout(timer)
  }
}
