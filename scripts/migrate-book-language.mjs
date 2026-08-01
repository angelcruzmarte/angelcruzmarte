// Adds the `language` column to the book table (two-letter language code,
// default "en"). Idempotent: safe to run repeatedly. Existing rows are tagged
// English so the storefront keeps showing them.
//   node --env-file-if-exists=/vercel/share/.env.project scripts/migrate-book-language.mjs
import { Pool } from "pg"

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query(
      `ALTER TABLE book ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'`,
    )
    // Backfill any NULLs defensively (should be none given the default).
    await client.query(
      `UPDATE book SET language = 'en' WHERE language IS NULL OR language = ''`,
    )
    // Index to keep the storefront's language filter fast as the catalog grows.
    await client.query(
      `CREATE INDEX IF NOT EXISTS book_language_idx ON book (language)`,
    )
    const { rows } = await client.query(
      `SELECT language, count(*)::int AS n FROM book GROUP BY language ORDER BY n DESC`,
    )
    console.log("[migrate] language column ready. Distribution:", rows)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err)
  process.exit(1)
})
