// Seeds one demo commercial (affiliate) title so the store shows the new tier.
// Idempotent: keyed on ISBN. The sample text is an original, publisher-style
// blurb (NOT copyrighted book text) — real titles get a licensed sample via
// the admin panel.
import pg from "pg"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error("[seed] DATABASE_URL is not set")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL })

const demo = {
  title: "The Almanack of Naval Ravikant",
  author: "Eric Jorgenson",
  category: "Business",
  isbn: "9781544514215",
  description:
    "A collection of wisdom on building wealth and long-term happiness, drawn from a decade of interviews, essays, and talks — curated into a single practical guide.",
  excerpt:
    "Getting rich is not just about luck; happiness is not just a trait we are born with. These aptitudes can be learned. Listen to a sample, then get the full book from Bookshop.org.",
  sampleText:
    "Welcome to this sample. Wealth is having assets that earn while you sleep. Money is how we transfer time and wealth. Status is your place in the social hierarchy. Understand the difference, and you begin to see why chasing status is a zero-sum game while building wealth is not. Seek wealth, not money or status. Learn to build and learn to sell; if you can do both, you will be unstoppable. This is a short preview of the ideas explored in the full book. Enjoy the sample narration, and continue the journey by purchasing the complete edition from our partner bookstore, which supports independent booksellers.",
  coverColor: "#0f2a43",
  accentColor: "#f4b740",
}

async function main() {
  const { rows } = await pool.query(`SELECT id FROM book WHERE "isbn" = $1 LIMIT 1`, [
    demo.isbn,
  ])
  if (rows[0]) {
    console.log("[seed] demo commercial book already exists, id:", rows[0].id)
    await pool.end().catch(() => {})
    process.exit(0)
  }

  const res = await pool.query(
    `INSERT INTO book
      (title, author, category, description, excerpt, content,
       "priceInCents", "fulfillment", "isbn", "sampleText", "buyUrl",
       "coverImageUrl", "coverColor", "accentColor", featured)
     VALUES ($1,$2,$3,$4,$5,'',0,'affiliate',$6,$7,NULL,NULL,$8,$9,true)
     RETURNING id`,
    [
      demo.title,
      demo.author,
      demo.category,
      demo.description,
      demo.excerpt,
      demo.isbn,
      demo.sampleText,
      demo.coverColor,
      demo.accentColor,
    ],
  )
  console.log("[seed] inserted demo commercial book, id:", res.rows[0]?.id)
  await pool.end().catch(() => {})
  process.exit(0)
}

main().catch(async (err) => {
  console.error("[seed] fatal:", err)
  await pool.end().catch(() => {})
  process.exit(1)
})
