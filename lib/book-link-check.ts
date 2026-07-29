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
        const healthy = await isUrlHealthy(url)
        if (healthy) {
          ok++
          await db
            .update(book)
            .set({ linkStatus: "ok", linkCheckedAt: now })
            .where(eq(book.id, r.id))
        } else {
          broken++
          await db
            .update(book)
            .set({
              linkStatus: "broken",
              linkCheckedAt: now,
              ...(r.availability === "available" ||
              r.availability === "affiliate_only"
                ? { availability: "needs_review" }
                : {}),
            })
            .where(eq(book.id, r.id))
        }
      }),
    )
  }

  revalidatePath("/admin/books")
  return { checked: rows.length, ok, broken }
}

/** GET with a timeout; treats <400 as healthy. */
async function isUrlHealthy(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "VOXYFI-LinkChecker/1.0" },
      cache: "no-store",
    })
    return res.status < 400
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
