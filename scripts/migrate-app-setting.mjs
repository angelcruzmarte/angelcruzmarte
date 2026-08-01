import pg from "pg"

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error("[migrate] No DATABASE_URL / POSTGRES_URL found")
  process.exit(1)
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()

  await client.query(`
    CREATE TABLE IF NOT EXISTS app_setting (
      "key" text PRIMARY KEY,
      "value" text NOT NULL,
      "updatedAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  console.log('[migrate] ensured table "app_setting"')

  // Helpful index for the pruning cron's cutoff scan on the audit log.
  await client.query(`
    CREATE INDEX IF NOT EXISTS book_audit_log_createdat_idx
    ON book_audit_log ("createdAt")
  `)
  console.log("[migrate] ensured index book_audit_log_createdat_idx")

  const { rows } = await client.query(`SELECT count(*)::int AS n FROM app_setting`)
  console.log(`[migrate] app_setting rows: ${rows[0].n}`)
  console.log("[migrate] done")
} catch (err) {
  console.error("[migrate] FAILED:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
