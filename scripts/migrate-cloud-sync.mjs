import pg from "pg"

// Adds cloud delta-sync tracking columns to the document table. Idempotent:
// safe to run repeatedly (ADD COLUMN IF NOT EXISTS + IF NOT EXISTS index).
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

await pool.query(
  `ALTER TABLE document ADD COLUMN IF NOT EXISTS "cloudProvider" text`,
)
await pool.query(
  `ALTER TABLE document ADD COLUMN IF NOT EXISTS "cloudFileId" text`,
)
await pool.query(
  `ALTER TABLE document ADD COLUMN IF NOT EXISTS "cloudRevision" text`,
)
await pool.query(
  `ALTER TABLE document ADD COLUMN IF NOT EXISTS "lastSyncedAt" timestamp`,
)

// Fast lookup of a user's tracked cloud files (used by reconcile + cron sweep).
await pool.query(
  `CREATE INDEX IF NOT EXISTS document_cloud_idx
   ON document ("userId", "cloudProvider", "cloudFileId")`,
)

console.log("Cloud-sync columns ready")
await pool.end()
