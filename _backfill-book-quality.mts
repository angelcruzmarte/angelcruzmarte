/**
 * One-off catalog backfill: re-normalizes metadata, fixes mislabeled
 * languages, rebuilds boilerplate descriptions, replaces generic Gutenberg
 * covers with real artwork (or a branded card via null), and holds
 * poor-quality books as unpublished / needs_review. Reuses the same libraries
 * as the live import pipeline. Run with DRY=1 to preview without writing.
 */
import { Pool } from "pg"
import {
  assessQuality,
  deriveDescription,
  isBoilerplateDescription,
  isGutenbergCover,
  normalizeAuthor,
  normalizeTitle,
  verifyLanguage,
} from "./lib/book-quality"
import { resolveRealCover } from "./lib/book-covers"

const DRY = process.env.DRY === "1"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

type Row = {
  id: number
  title: string
  author: string
  description: string
  excerpt: string
  language: string
  sample: string
  coverImageUrl: string | null
  isbn: string | null
  fulfillment: string
  published: boolean
  availability: string
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<void>,
) {
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++
      await fn(items[i], i)
      if ((i + 1) % 50 === 0) console.log(`  …processed ${i + 1}/${items.length}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

async function main() {
  const { rows } = await pool.query<Row>(
    `SELECT id, title, author, description, excerpt, language,
            left(content, 6000) AS sample,
            "coverImageUrl", isbn, fulfillment, published, availability
     FROM book`,
  )
  console.log(`Loaded ${rows.length} books. DRY=${DRY}`)

  const stats = {
    languageFixed: 0,
    descriptionFixed: 0,
    coverReplaced: 0,
    coverCleared: 0,
    coverKept: 0,
    heldForReview: 0,
    recovered: 0,
    updated: 0,
  }

  await mapWithConcurrency(rows, 6, async (r) => {
    const title = normalizeTitle(r.title)
    const author = normalizeAuthor(r.author)
    const sample = `${title} ${r.sample || ""} ${r.description || ""}`

    // Language: only overrides on a decisive non-Latin script mismatch.
    const { language } = verifyLanguage(r.language, sample)
    if (language !== r.language) stats.languageFixed++

    // Description: rebuild only when the stored one is boilerplate/empty, so
    // curated (e.g. affiliate) descriptions are preserved.
    let description = r.description
    let excerpt = r.excerpt
    if (isBoilerplateDescription(r.description)) {
      const d = deriveDescription(r.sample || "")
      if (d.description) {
        description = d.description
        excerpt = d.excerpt || r.excerpt
        stats.descriptionFixed++
      }
    }

    // Cover: replace generic Gutenberg / missing covers with real artwork; keep
    // existing real (non-Gutenberg) covers untouched.
    let coverImageUrl = r.coverImageUrl
    if (!r.coverImageUrl || isGutenbergCover(r.coverImageUrl)) {
      const real = await resolveRealCover({ title, author, isbn: r.isbn })
      if (real) {
        coverImageUrl = real
        stats.coverReplaced++
      } else {
        coverImageUrl = null // → branded card in the UI
        if (r.coverImageUrl) stats.coverCleared++
      }
    } else {
      stats.coverKept++
    }

    // Quality gate (assessed on the corrected metadata).
    const verdict = assessQuality({ title, author, description, language, sample })
    let published = r.published
    let availability = r.availability
    if (!verdict.publishable) {
      published = false
      availability = "needs_review"
      stats.heldForReview++
    } else if (r.availability === "needs_review") {
      published = true
      availability = "available"
      stats.recovered++
    }

    const changed =
      title !== r.title ||
      author !== r.author ||
      language !== r.language ||
      description !== r.description ||
      excerpt !== r.excerpt ||
      coverImageUrl !== r.coverImageUrl ||
      published !== r.published ||
      availability !== r.availability
    if (!changed) return
    stats.updated++
    if (DRY) return

    await pool.query(
      `UPDATE book SET title=$1, author=$2, language=$3, description=$4,
              excerpt=$5, "coverImageUrl"=$6, published=$7, availability=$8,
              "updatedAt"=now()
       WHERE id=$9`,
      [title, author, language, description, excerpt, coverImageUrl, published, availability, r.id],
    )
  })

  console.log("Done:", JSON.stringify(stats, null, 2))
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
