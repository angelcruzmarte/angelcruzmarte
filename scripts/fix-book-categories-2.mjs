import { Pool } from "pg"

/**
 * Second-pass category cleanup: hand-tuned corrections for stragglers found in
 * the large auto-derived buckets (History, Fiction, Classics). Keyed by book
 * id so it is safe to re-run (idempotent) and easy to audit. Only unambiguous
 * mismatches are moved; genuine literary classics and real histories are left
 * where they are.
 */

// bookId -> correct category
const MOVES = {
  // --- History -> these are novels / plays / poems / philosophy, not history ---
  564: "Fiction", // The White Company — Conan Doyle (historical novel)
  565: "Fiction", // The Adventures of Gerard — Conan Doyle
  567: "Fiction", // The Exploits of Brigadier Gerard — Conan Doyle
  943: "Fiction", // Sir Nigel — Conan Doyle
  516: "Classics", // Martin Chuzzlewit — Dickens
  542: "Classics", // The Old Curiosity Shop — Dickens
  940: "Classics", // Barnaby Rudge — Dickens
  544: "Fiction", // Bartleby, the Scrivener — Melville
  545: "Fiction", // The Blithedale Romance — Hawthorne
  941: "Fiction", // The Wouldbegoods — E. Nesbit
  937: "Fiction", // Puck of Pook's Hill — Kipling
  563: "Fiction", // Lorna Doone — R. D. Blackmore
  232: "Fiction", // Punainen rutto (The Scarlet Plague) — Jack London
  566: "Poetry", // The Ballad of the White Horse — Chesterton
  124: "Philosophy", // Φαίδων (Phaedo) — Plato
  562: "Philosophy", // Ion — Plato
  935: "Drama & Plays", // Cymbeline — Shakespeare
  936: "Drama & Plays", // King Henry IV, Part 2 — Shakespeare
  938: "Drama & Plays", // Kuningas Henrik Kahdeksas (Henry VIII) — Shakespeare
  939: "Drama & Plays", // Le roi Jean (King John) — Shakespeare
  942: "Drama & Plays", // Kuningas Henrik Kuudes II — Shakespeare
  944: "Drama & Plays", // Kuningas Henrik Kuudes III — Shakespeare
  1706: "Fiction", // 粉妝樓 wuxia serial — Luo Guanzhong
  1708: "Fiction",
  1709: "Fiction",
  1710: "Fiction",
  1712: "Fiction",
  1713: "Fiction",
  1714: "Fiction",
  1750: "Fiction", // 血笑記 — Leonid Andreyev (fiction)

  // --- Classics -> reference / non-fiction that isn't classic literature ---
  // Dictionaries, grammars, textbooks, cookbooks and how-to guides are grouped
  // into a single "Reference" shelf rather than several one-book shelves.
  1763: "Reference", // Korean–English Dictionary
  1684: "Reference", // English-Esperanto Dictionary
  1679: "Reference", // A Complete Grammar of Esperanto
  1680: "Reference", // The Esperanto Teacher
  1693: "Reference", // Úplná učebnice mezinárodní řeči (Esperanto textbook)
  1323: "Reference", // Extracto de la gramatica mutsun
  1493: "Reference", // Bases da ortografia portuguesa
  1309: "Reference", // La Mejor Cocinera, Recetas de Cocina (cookbook)
  1553: "Reference", // Szachy i Warcaby (chess & checkers guide)
  1666: "Nature & Environment", // Vand- og stenhoejsplanter (garden plants)
  1668: "Nature & Environment", // Stauder (perennials)
  100: "Politics", // The Communist Manifesto — Marx
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  let moved = 0
  const summary = {}
  try {
    for (const [id, category] of Object.entries(MOVES)) {
      const res = await pool.query(
        `UPDATE book SET category = $1 WHERE id = $2 AND category <> $1 RETURNING title`,
        [category, Number(id)],
      )
      if (res.rowCount > 0) {
        moved += res.rowCount
        summary[category] = (summary[category] ?? 0) + res.rowCount
        console.log(`[fix-cat2] ${id} -> ${category}: "${res.rows[0].title.slice(0, 50)}"`)
      }
    }
    console.log(`[fix-cat2] done. moved ${moved} books.`)
    console.log(`[fix-cat2] by target:`, JSON.stringify(summary))

    // Guard: report any category left with a single book (may want merging).
    const singles = await pool.query(
      `SELECT category, count(*)::int n FROM book GROUP BY category HAVING count(*) = 1 ORDER BY category`,
    )
    if (singles.rowCount > 0) {
      console.log(
        `[fix-cat2] single-book shelves:`,
        singles.rows.map((r) => r.category).join(", "),
      )
    } else {
      console.log(`[fix-cat2] no single-book shelves.`)
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error("[fix-cat2] failed:", e)
  process.exit(1)
})
