// Adds merchandising + link-health + updatedAt columns to the book table.
// Idempotent: safe to run multiple times.
import pg from "pg"

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const client = await pool.connect()
  try {
    await client.query(
      `ALTER TABLE "book" ADD COLUMN IF NOT EXISTS "availability" text NOT NULL DEFAULT 'available'`,
    )
    await client.query(
      `ALTER TABLE "book" ADD COLUMN IF NOT EXISTS "linkStatus" text NOT NULL DEFAULT 'unknown'`,
    )
    await client.query(
      `ALTER TABLE "book" ADD COLUMN IF NOT EXISTS "linkCheckedAt" timestamp`,
    )
    await client.query(
      `ALTER TABLE "book" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp NOT NULL DEFAULT now()`,
    )

    // Backfill updatedAt to createdAt for existing rows so sorting is sensible.
    await client.query(`UPDATE "book" SET "updatedAt" = "createdAt"`)

    // Affiliate titles are sample-in-app / buy-out; label them "affiliate_only"
    // where they're still on the plain default so the status is meaningful.
    await client.query(
      `UPDATE "book" SET "availability" = 'affiliate_only' WHERE "fulfillment" = 'affiliate' AND "availability" = 'available'`,
    )

    // Helpful indexes for filter/sort at scale.
    await client.query(
      `CREATE INDEX IF NOT EXISTS "book_availability_idx" ON "book" ("availability")`,
    )
    await client.query(
      `CREATE INDEX IF NOT EXISTS "book_published_idx" ON "book" ("published")`,
    )
    await client.query(
      `CREATE INDEX IF NOT EXISTS "book_updatedAt_idx" ON "book" ("updatedAt")`,
    )
    await client.query(
      `CREATE INDEX IF NOT EXISTS "book_fulfillment_idx" ON "book" ("fulfillment")`,
    )

    const { rows } = await client.query(`SELECT count(*)::int AS count FROM "book"`)
    console.log(
      `[migrate] availability/link/updatedAt columns ready. ${rows[0].count} books.`,
    )
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((e) => {
  console.error("[migrate] failed:", e)
  process.exit(1)
})
