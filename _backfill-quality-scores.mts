/**
 * One-off: compute a metadata quality score + report for every existing book.
 *
 * Policy (confirmed): score ALL books, but only pull a currently-published
 * book OFF the store when it HARD-fails (placeholder cover, boilerplate
 * description, language mismatch, invalid/missing retail ISBN, or duplicate).
 * Borderline books that merely score below threshold stay visible.
 */
import { Pool } from "pg"
import { scoreBook, dedupeKey } from "./lib/book-quality"

const DRY = process.env.DRY === "1"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

type Row = {
  id: number
  title: string
  author: string
  language: string
  category: string
  description: string | null
  content: string | null
  isbn: string | null
  publicationYear: number | null
  fulfillment: string
  coverImageUrl: string | null
  published: boolean
  availability: string
}

const { rows } = await pool.query<Row>(
  `SELECT id, title, author, language, category, description, content, isbn,
          "publicationYear", fulfillment, "coverImageUrl", published, availability
   FROM book`,
)
console.log(`[backfill] scoring ${rows.length} books (DRY=${DRY})`)

// Build a dedupe map: first occurrence of a (title+author) key is the
// "canonical" one; later ones are duplicates of it.
const canonical = new Map<string, number>()
for (const r of rows) {
  const key = dedupeKey(r.title, r.author)
  if (!canonical.has(key)) canonical.set(key, r.id)
}

const stats = {
  scored: 0,
  publish: 0,
  review: 0,
  quarantinedNow: 0, // was live, now hidden
  keptLiveBorderline: 0, // below threshold but no hard flag -> left visible
  flags: {} as Record<string, number>,
}

let batch: string[] = []
async function flush() {
  if (DRY || batch.length === 0) return
  await pool.query(batch.join(";\n"))
  batch = []
}

for (const r of rows) {
  const key = dedupeKey(r.title, r.author)
  const canonId = canonical.get(key)!
  const duplicateOf = canonId !== r.id ? canonId : null

  const report = scoreBook({
    title: r.title,
    author: r.author,
    language: r.language,
    coverImageUrl: r.coverImageUrl,
    description: r.description ?? "",
    publicationYear: r.publicationYear,
    isbn: r.isbn,
    category: r.category,
    sample: `${r.title} ${(r.content ?? "").slice(0, 1200)}`,
    fulfillment: r.fulfillment === "affiliate" ? "affiliate" : "in_app",
    duplicateOf,
  })

  stats.scored++
  if (report.verdict === "publish") stats.publish++
  else stats.review++
  for (const f of report.flags) stats.flags[f] = (stats.flags[f] ?? 0) + 1

  // Decide visibility. Only hide a currently-visible book on a HARD failure.
  const hardFail = report.flags.length > 0
  let published = r.published
  let availability = r.availability
  if (hardFail && r.availability === "available") {
    published = false
    availability = "needs_review"
    stats.quarantinedNow++
  } else if (report.verdict === "review" && !hardFail && r.availability === "available") {
    stats.keptLiveBorderline++
  }

  const reportJson = JSON.stringify(report).replace(/'/g, "''")
  batch.push(
    `UPDATE book SET
       "qualityScore" = ${report.score},
       "qualityReport" = '${reportJson}'::jsonb,
       "qualityCheckedAt" = now(),
       published = ${published},
       availability = '${availability}'
     WHERE id = ${r.id}`,
  )
  if (batch.length >= 50) await flush()
}
await flush()

console.log("[backfill] done:", JSON.stringify(stats, null, 2))
await pool.end()
