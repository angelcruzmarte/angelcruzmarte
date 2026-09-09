// One-time migration: add payment-source + Apple IAP entitlement columns.
// Additive and idempotent — safe to run multiple times. Existing rows default
// to the 'stripe' payment provider so the live web flow is unaffected.
import pg from "pg"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

const statements = [
  // Premium entitlement source + Apple identifiers on the user row.
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "paymentProvider" text NOT NULL DEFAULT 'stripe'`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "appleOriginalTransactionId" text`,
  `ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "appleProductId" text`,
  // Book-purchase source + Apple transaction id.
  `ALTER TABLE book_purchase ADD COLUMN IF NOT EXISTS "paymentProvider" text NOT NULL DEFAULT 'stripe'`,
  `ALTER TABLE book_purchase ADD COLUMN IF NOT EXISTS "appleTransactionId" text`,
  // Lookups used by the (future) Apple verification/notification path.
  `CREATE INDEX IF NOT EXISTS "user_apple_orig_txn_idx" ON "user" ("appleOriginalTransactionId")`,
  `CREATE INDEX IF NOT EXISTS "book_purchase_apple_txn_idx" ON book_purchase ("appleTransactionId")`,
]

async function main() {
  for (const sql of statements) {
    console.log("[migrate]", sql)
    await pool.query(sql)
  }
  console.log("[migrate] apple-iap migration complete")
  await pool.end().catch(() => {})
  process.exit(0)
}

main().catch(async (err) => {
  console.error("[migrate] fatal:", err)
  await pool.end().catch(() => {})
  process.exit(1)
})
