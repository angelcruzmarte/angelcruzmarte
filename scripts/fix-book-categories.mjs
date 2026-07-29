// One-off catalog cleanup: corrects auto-derived category assignments for
// specific public-domain titles that the multilingual seed mis-shelved
// (e.g. novels filed under Self-Help/Psychology/Economics, Poe's poetry under
// Nature, the U.S. Constitution under Mathematics). Keyed by book id so it is
// fully surgical and idempotent — re-running only sets the same target values.
import { Pool } from "pg"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
})

// bookId -> corrected category. Every id was verified by title + author.
const FIXES = {
  // --- Self-Help: only "The Elements of Style" belongs; rest are novels ---
  264: "Classics", // Bleak House — Dickens
  265: "Classics", // Our Mutual Friend — Dickens
  539: "Philosophy", // Laches — Plato
  602: "Fiction", // The Titan — Dreiser
  603: "Humor & Satire", // The Adventures of Sally — Wodehouse
  604: "Fiction", // The Claverings — Trollope
  989: "Classics", // Pamela — Richardson

  // --- Business (1 book) merged into Self-Help to avoid a 1-book shelf ---
  1295: "Self-Help", // The Almanack of Naval Ravikant

  // --- Psychology: keep Freud/James/Russell; move out the novels/dialogues ---
  346: "Fiction", // Ennen Aatamia (Before Adam) — Jack London
  543: "Fiction", // Hunger — Knut Hamsun
  607: "Fiction", // Anne's House of Dreams — Montgomery
  907: "Philosophy", // Philebus — Plato
  908: "Philosophy", // What Is Man? and Other Essays — Twain

  // --- Economics: keep the economists; move out fiction/drama/science ---
  584: "Fiction", // Carnet d'un inconnu (Stepanchikovo) — Dostoyevsky
  585: "Drama & Plays", // Ei sitä voi koskaan tietää (You Never Can Tell) — Shaw
  587: "Science", // Untersuchungen über die radioaktiven Substanzen — Curie

  // --- Mathematics: the Constitution is not math ---
  580: "Politics", // The United States Constitution

  // --- Science: a children's fantasy slipped in ---
  962: "Children's Fiction", // On a lark to the planets — Montgomery

  // --- Nature & Environment: an adventure novel and a poetry collection ---
  135: "Adventure", // The Coral Island — Ballantyne
  980: "Poetry", // The Complete Poetical Works of Edgar Allan Poe

  // --- Politics: keep the tracts/chronicles; move out novels & dialogues ---
  117: "Science Fiction", // Rautakorko (The Iron Heel) — Jack London
  247: "Philosophy", // Laws — Plato
  569: "Philosophy", // Statesman — Plato
  571: "Romance", // The Best Man — Grace Livingston Hill
  572: "Fiction", // Pointed Roofs — Dorothy M. Richardson
  952: "Biography & Memoir", // Marie Antoinette — Belloc
  953: "Fiction", // Israel Potter — Melville
}

async function main() {
  const entries = Object.entries(FIXES)
  console.log(`[fix-cat] applying ${entries.length} category corrections`)

  let changed = 0
  let missing = 0
  for (const [id, category] of entries) {
    const res = await pool.query(
      `UPDATE book SET category = $1 WHERE id = $2 AND category <> $1`,
      [category, Number(id)],
    )
    if (res.rowCount > 0) changed += res.rowCount
    else {
      // Confirm the row exists (already-correct rows report 0 rowCount too).
      const check = await pool.query(`SELECT 1 FROM book WHERE id = $1`, [
        Number(id),
      ])
      if (check.rowCount === 0) {
        missing++
        console.warn(`[fix-cat] WARNING: book id ${id} not found`)
      }
    }
  }

  console.log(`[fix-cat] updated ${changed} rows (${missing} ids missing)`)

  // Report the resulting distribution and flag any 1-book shelves.
  const dist = await pool.query(
    `SELECT category, count(*)::int n FROM book GROUP BY category ORDER BY n DESC`,
  )
  const singles = dist.rows.filter((r) => r.n === 1)
  console.log(`[fix-cat] categories now: ${dist.rows.length}`)
  if (singles.length > 0) {
    console.log(
      `[fix-cat] 1-book shelves: ${singles.map((s) => s.category).join(", ")}`,
    )
  } else {
    console.log("[fix-cat] no 1-book shelves remain")
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("[fix-cat] failed:", err)
    pool.end()
    process.exit(1)
  })
