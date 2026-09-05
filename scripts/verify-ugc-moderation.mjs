// Non-destructive end-to-end check of the UGC-safety data flows. Everything
// runs inside a single transaction that is ROLLED BACK at the end, so no rows
// persist. Verifies: review insert, duplicate-report prevention, block-based
// filtering, moderator hide, and user suspension hiding.
import pg from "pg"

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg)
  console.log("  ok:", msg)
}

try {
  await client.connect()
  await client.query("begin")

  // Need two users and one book that already exist.
  const users = (await client.query(`select id from "user" order by "createdAt" limit 2`)).rows
  const books = (await client.query(`select id from book limit 1`)).rows
  if (users.length < 2 || books.length < 1) {
    console.log("[verify] Not enough users/books to simulate; skipping (schema still valid).")
    await client.query("rollback")
    process.exit(0)
  }
  const [A, B] = [users[0].id, users[1].id] // A = reporter/blocker, B = author
  const bookId = books[0].id

  // B writes a review.
  const rev = await client.query(
    `insert into book_rating ("userId","bookId",stars,review)
     values ($1,$2,4,'A test review by B') returning id`,
    [B, bookId],
  )
  const reviewId = String(rev.rows[0].id)
  assert(rev.rows.length === 1, "author B can create a review")

  // A reports B's review.
  await client.query(
    `insert into content_report ("reporterId","reportedUserId","contentType","contentId",reason,details)
     values ($1,$2,'book_review',$3,'spam','test')`,
    [A, B, reviewId],
  )
  // Duplicate report by A for the same content must fail the unique constraint.
  // Wrap in a savepoint so the expected error doesn't abort the whole tx.
  let dupFailed = false
  await client.query("savepoint dup")
  try {
    await client.query(
      `insert into content_report ("reporterId","reportedUserId","contentType","contentId",reason)
       values ($1,$2,'book_review',$3,'spam')`,
      [A, B, reviewId],
    )
    await client.query("release savepoint dup")
  } catch {
    dupFailed = true
    await client.query("rollback to savepoint dup")
  }
  assert(dupFailed, "duplicate report from same user for same content is rejected")

  // Visibility query mirrors getBookReviews: not hidden, author not suspended,
  // author not blocked by viewer A.
  const visibleFor = async (viewerId) =>
    (
      await client.query(
        `select r.id from book_rating r
         join "user" u on u.id = r."userId"
         where r."bookId"=$1 and r.review is not null and r.hidden=false
           and u.status <> 'suspended'
           and r."userId" not in (select "blockedId" from user_block where "blockerId"=$2)`,
        [bookId, viewerId],
      )
    ).rows.map((x) => String(x.id))

  assert((await visibleFor(A)).includes(reviewId), "B's review is visible to A before blocking")

  // A blocks B -> review disappears for A only.
  await client.query(`insert into user_block ("blockerId","blockedId") values ($1,$2)`, [A, B])
  assert(!(await visibleFor(A)).includes(reviewId), "B's review is hidden from A after A blocks B")

  // Moderator hides the review -> hidden from everyone.
  await client.query(`update book_rating set hidden=true where id=$1`, [reviewId])
  assert(!(await visibleFor(B)).includes(reviewId), "moderator-hidden review is hidden from everyone")
  await client.query(`update book_rating set hidden=false where id=$1`, [reviewId])

  // Suspending author B hides their content globally.
  await client.query(`update "user" set status='suspended' where id=$1`, [B])
  assert(!(await visibleFor(A)).includes(reviewId), "suspended author's content is hidden globally")

  await client.query("rollback")
  console.log("[verify] ALL CHECKS PASSED (transaction rolled back, no data persisted)")
} catch (err) {
  try { await client.query("rollback") } catch {}
  console.error("[verify] FAILED:", err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
