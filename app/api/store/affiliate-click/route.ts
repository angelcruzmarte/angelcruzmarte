import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { book } from "@/lib/db/schema"
import { recordAffiliateClick } from "@/lib/book-analytics"
import { getCurrentUser } from "@/lib/session"

/**
 * Records an affiliate (Amazon) click-out. Called fire-and-forget from the
 * "Buy on Amazon" button. Accepts a catalog `bookId` (preferred — title/author
 * are snapshotted from the DB) or a raw title/author for non-catalog live
 * search results. Always returns 204 quickly; tracking never blocks the buy.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      bookId?: number
      title?: string
      author?: string
    }

    const user = await getCurrentUser().catch(() => null)

    let title = (body.title ?? "").toString()
    let author = (body.author ?? "").toString()
    let bookId: number | null = null

    if (typeof body.bookId === "number" && Number.isFinite(body.bookId)) {
      const [row] = await db
        .select({ id: book.id, title: book.title, author: book.author })
        .from(book)
        .where(eq(book.id, body.bookId))
        .limit(1)
      if (row) {
        bookId = row.id
        title = row.title
        author = row.author
      }
    }

    if (title.trim()) {
      await recordAffiliateClick({
        bookId,
        title: title.trim(),
        author: author.trim(),
        userId: user?.id ?? null,
      })
    }
  } catch {
    // Best-effort; ignore.
  }
  return new NextResponse(null, { status: 204 })
}
