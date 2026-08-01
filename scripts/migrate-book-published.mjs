import pg from "pg"

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const client = await pool.connect()
  try {
    // Add the storefront-visibility flag. Idempotent + backfills existing rows
    // to visible so nothing disappears from the store.
    await client.query(`
      ALTER TABLE "book"
      ADD COLUMN IF NOT EXISTS "published" boolean NOT NULL DEFAULT true;
    `)
    console.log("[migrate] book.published column ready")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err)
  process.exit(1)
})
