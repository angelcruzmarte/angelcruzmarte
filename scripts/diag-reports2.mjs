import { Pool } from "pg"
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const c = await pool.connect()
try {
  const users = await c.query(
    `select id, name, username, email, role, status from "user" where lower(username) in ('acm','admin') or lower(name)='acm' order by username`,
  )
  console.log("=== users matching acm/admin ===")
  for (const r of users.rows)
    console.log(
      `${r.id} | name=${r.name} | @${r.username} | role=${r.role} | status=${r.status} | ${r.email}`,
    )

  const reviews = await c.query(
    `select id, "userId", "bookId", left(coalesce(review,''),30) rev, hidden, "createdAt" from book_rating where coalesce(review,'') <> '' order by id desc limit 10`,
  )
  console.log("\n=== reviews with text ===")
  for (const r of reviews.rows)
    console.log(
      `review#${r.id} | author=${r.userId} | book=${r.bookId} | hidden=${r.hidden} | "${r.rev}"`,
    )

  const reports = await c.query(
    `select id, "reporterId", "reportedUserId", "contentType", "contentId", status, "createdAt" from content_report order by "createdAt" desc limit 20`,
  )
  console.log("\n=== content_report rows:", reports.rowCount, "===")
  for (const r of reports.rows)
    console.log(
      `#${r.id} | reporter=${r.reporterId} | reported=${r.reportedUserId} | ${r.contentType}:${r.contentId} | ${r.status} | ${r.createdAt?.toISOString?.() ?? r.createdAt}`,
    )

  const blocks = await c.query(
    `select id, "blockerId", "blockedId", "createdAt" from user_block order by "createdAt" desc limit 20`,
  )
  console.log("\n=== user_block rows:", blocks.rowCount, "===")
  for (const r of blocks.rows)
    console.log(`#${r.id} | blocker=${r.blockerId} | blocked=${r.blockedId}`)

  const sessions = await c.query(
    `select "userId", count(*)::int n, max("updatedAt") last from session group by "userId" order by last desc limit 8`,
  )
  console.log("\n=== recent sessions by user ===")
  for (const r of sessions.rows)
    console.log(
      `${r.userId} | sessions=${r.n} | last=${r.last?.toISOString?.() ?? r.last}`,
    )
} finally {
  c.release()
  await pool.end()
}
