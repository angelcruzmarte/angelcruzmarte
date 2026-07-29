// Creates the book_audit_log table (append-only admin action trail) if absent.
// Raw pg, same pattern as the other migrate-*.mjs scripts.
import pg from "pg"

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
if (!url) {
  console.error("[migrate] No DATABASE_URL / POSTGRES_URL in env")
  process.exit(1)
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})

const SQL = `
create table if not exists book_audit_log (
  id serial primary key,
  "bookId" integer,
  "bookTitle" text not null default '',
  action text not null,
  field text,
  "oldValue" text,
  "newValue" text,
  "actorId" text,
  "actorName" text not null default '',
  "actorEmail" text not null default '',
  "createdAt" timestamp not null default now()
);
create index if not exists book_audit_log_created_idx on book_audit_log ("createdAt" desc);
create index if not exists book_audit_log_action_idx on book_audit_log (action);
create index if not exists book_audit_log_book_idx on book_audit_log ("bookId");
`

try {
  await client.connect()
  await client.query(SQL)
  const { rows } = await client.query(
    `select count(*)::int as n from book_audit_log`,
  )
  console.log(`[migrate] book_audit_log ready (${rows[0].n} existing rows)`)
} catch (err) {
  console.error("[migrate] failed:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
