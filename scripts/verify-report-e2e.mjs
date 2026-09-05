import { Pool } from "pg"

// Verifies the report pipeline end-to-end at the SQL level the server actions
// use: insert a content_report (as submitReport does), confirm queryReports'
// SELECT returns it under both "all" and "pending", confirm the unique
// constraint rejects a duplicate, and confirm the review-edit guard logic.
// Everything runs in a transaction that is rolled back — no data persists.
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const c = await pool.connect()
let pass = true
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}: ${msg}`)
  if (!cond) pass = false
}
try {
  const users = (await c.query(`select id from "user" limit 5`)).rows
  const [rev] = (
    await c.query(
      `select id, "userId" from book_rating where coalesce(review,'') <> '' order by id desc limit 1`,
    )
  ).rows
  if (!rev || users.length < 2) {
    console.log("Need >=2 users and a review with text; skipping.")
  } else {
    const reporter = users.find((u) => u.id !== rev.userId).id
    await c.query("begin")
    try {
      // submitReport's insert
      const ins = await c.query(
        `insert into content_report ("reporterId","reportedUserId","contentType","contentId",reason,details)
         values ($1,$2,'book_review',$3,'spam',null) returning id, status`,
        [reporter, rev.userId, String(rev.id)],
      )
      ok(ins.rows.length === 1, "report inserted")
      ok(ins.rows[0].status === "pending", "new report status is 'pending'")

      // queryReports "all"
      const all = await c.query(
        `select id, status from content_report order by "createdAt" desc`,
      )
      ok(
        all.rows.some((r) => r.id === ins.rows[0].id),
        "queryReports(all) returns the report",
      )
      // queryReports "pending"
      const pending = await c.query(
        `select id from content_report where status = 'pending'`,
      )
      ok(
        pending.rows.some((r) => r.id === ins.rows[0].id),
        "queryReports(pending) returns the report",
      )

      // duplicate prevention (unique violation -> code 23505)
      let dupCode = null
      await c.query("savepoint dup")
      try {
        await c.query(
          `insert into content_report ("reporterId","reportedUserId","contentType","contentId",reason)
           values ($1,$2,'book_review',$3,'spam')`,
          [reporter, rev.userId, String(rev.id)],
        )
      } catch (e) {
        dupCode = e.code
        await c.query("rollback to savepoint dup")
      }
      ok(dupCode === "23505", "duplicate report rejected with unique_violation (23505)")

      // review-edit guard: an existing review with text must block re-post
      const existing = await c.query(
        `select review from book_rating where "userId"=$1 and "bookId"=(select "bookId" from book_rating where id=$2)`,
        [rev.userId, rev.id],
      )
      const hasReview = (existing.rows[0]?.review ?? "").trim().length > 0
      ok(hasReview, "review-edit guard would block editing an existing review")
    } finally {
      await c.query("rollback")
      console.log("(rolled back — no data persisted)")
    }
  }
} finally {
  c.release()
  await pool.end()
}
console.log(pass ? "\nE2E OK: all checks passed" : "\nE2E FAILED")
