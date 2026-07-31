/**
 * Adds metadata-quality columns to the `book` table:
 *   publicationYear, qualityScore, qualityReport (jsonb), qualityCheckedAt
 * Idempotent — safe to run multiple times.
 */
import { Pool } from "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    await client.query(`
      ALTER TABLE "book"
        ADD COLUMN IF NOT EXISTS "publicationYear" integer,
        ADD COLUMN IF NOT EXISTS "qualityScore" integer,
        ADD COLUMN IF NOT EXISTS "qualityReport" jsonb,
        ADD COLUMN IF NOT EXISTS "qualityCheckedAt" timestamp
    `)
    // Helpful index for the admin review queue (order by score, filter held).
    await client.query(`
      CREATE INDEX IF NOT EXISTS "book_quality_score_idx"
        ON "book" ("qualityScore")
    `)
    console.log("[migrate-book-quality] columns + index ensured")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[migrate-book-quality] failed:", err)
  process.exit(1)
})
