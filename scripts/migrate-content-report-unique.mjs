import { Pool } from "pg"

// The content_report schema declares a unique (reporterId, contentType,
// contentId) constraint so a user can't file duplicate reports for the same
// item, but the live table was created without it. This adds it if missing.
// (There are no duplicate rows to clean up first.)
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const c = await pool.connect()
try {
  await c.query(`
    do $$
    begin
      if not exists (
        select 1 from pg_constraint
        where conname = 'content_report_reporter_content_unique'
      ) then
        alter table content_report
          add constraint content_report_reporter_content_unique
          unique ("reporterId", "contentType", "contentId");
      end if;
    end $$;
  `)
  const cons = await c.query(
    `select conname, pg_get_constraintdef(oid) def from pg_constraint where conrelid='content_report'::regclass order by conname`,
  )
  console.log("=== content_report constraints ===")
  for (const r of cons.rows) console.log(`${r.conname}: ${r.def}`)
} finally {
  c.release()
  await pool.end()
}
