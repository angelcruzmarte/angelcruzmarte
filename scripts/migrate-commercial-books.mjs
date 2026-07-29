// One-time migration: add the commercial (affiliate) book tier columns.
// Idempotent — safe to run multiple times.
import pg from "pg"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

const statements = [
  `ALTER TABLE book ADD COLUMN IF NOT EXISTS "fulfillment" text NOT NULL DEFAULT 'in_app'`,
  `ALTER TABLE book ADD COLUMN IF NOT EXISTS "isbn" text`,
  `ALTER TABLE book ADD COLUMN IF NOT EXISTS "sampleText" text`,
  `ALTER TABLE book ADD COLUMN IF NOT EXISTS "buyUrl" text`,
]

async function main() {
  for (const sql of statements) {
    console.log("[migrate]", sql)
    await pool.query(sql)
  }
  console.log("[migrate] commercial-books migration complete")
  await pool.end().catch(() => {})
  process.exit(0)
}

main().catch(async (err) => {
  console.error("[migrate] fatal:", err)
  await pool.end().catch(() => {})
  process.exit(1)
})
