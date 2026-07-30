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

  // Append-only bookstore commerce analytics stream.
  //   type "affiliate_click"  → click-out to Amazon (provider "amazon")
  //   type "native_purchase"  → completed VOXYFI Stripe purchase ("voxyfi")
  // bookId is intentionally NOT a FK so events survive book deletion.
  await client.query(`
    CREATE TABLE IF NOT EXISTS book_event (
      "id" serial PRIMARY KEY,
      "type" text NOT NULL,
      "bookId" integer,
      "bookTitle" text NOT NULL DEFAULT '',
      "author" text NOT NULL DEFAULT '',
      "provider" text NOT NULL DEFAULT '',
      "amountCents" integer NOT NULL DEFAULT 0,
      "userId" text,
      "createdAt" timestamp NOT NULL DEFAULT now()
    )
  `)
  console.log('[migrate] ensured table "book_event"')

  // Dashboard queries filter by type over a recent time window.
  await client.query(`
    CREATE INDEX IF NOT EXISTS book_event_type_createdat_idx
    ON book_event ("type", "createdAt")
  `)
  console.log("[migrate] ensured index book_event_type_createdat_idx")

  // Most-clicked aggregation groups by book.
  await client.query(`
    CREATE INDEX IF NOT EXISTS book_event_bookid_idx
    ON book_event ("bookId")
  `)
  console.log("[migrate] ensured index book_event_bookid_idx")

  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM book_event`,
  )
  console.log(`[migrate] book_event rows: ${rows[0].n}`)
  console.log("[migrate] done")
} catch (err) {
  console.error("[migrate] FAILED:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
