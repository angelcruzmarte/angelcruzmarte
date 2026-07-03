// Seeds the book catalog from Project Gutenberg (real, live public-domain
// library). Each entry gets a real cover image and the real full book text
// used for text-to-speech. Run with:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/seed-books.mjs
import { Pool } from "pg"

// Curated set of well-known public-domain titles with their Project Gutenberg
// ebook ids. Prices are assigned by us; the content + covers are real.
const CATALOG = [
  // Fiction & Classics
  { id: 1342, category: "Fiction", price: 599, featured: true },   // Pride and Prejudice
  { id: 1260, category: "Fiction", price: 599 },                    // Jane Eyre
  { id: 768, category: "Fiction", price: 499 },                     // Wuthering Heights
  { id: 1400, category: "Fiction", price: 599, featured: true },    // Great Expectations
  { id: 98, category: "Fiction", price: 599 },                      // A Tale of Two Cities
  { id: 158, category: "Fiction", price: 499 },                     // Emma
  { id: 161, category: "Fiction", price: 499 },                     // Sense and Sensibility
  { id: 1184, category: "Fiction", price: 699 },                    // The Count of Monte Cristo
  { id: 730, category: "Fiction", price: 499 },                     // Oliver Twist
  // Mystery & Horror
  { id: 1661, category: "Mystery", price: 599, featured: true },    // Sherlock Holmes
  { id: 345, category: "Horror", price: 599, featured: true },      // Dracula
  { id: 84, category: "Horror", price: 599 },                       // Frankenstein
  { id: 43, category: "Horror", price: 499 },                       // Jekyll and Hyde
  { id: 174, category: "Fiction", price: 499 },                     // The Picture of Dorian Gray
  // Adventure
  { id: 120, category: "Adventure", price: 499 },                   // Treasure Island
  { id: 2701, category: "Adventure", price: 699, featured: true },  // Moby Dick
  { id: 103, category: "Adventure", price: 499 },                   // Around the World in 80 Days
  { id: 164, category: "Adventure", price: 499 },                   // 20,000 Leagues Under the Sea
  { id: 74, category: "Adventure", price: 499 },                    // Tom Sawyer
  { id: 76, category: "Adventure", price: 499 },                    // Huckleberry Finn
  // Science Fiction
  { id: 35, category: "Science Fiction", price: 499 },              // The Time Machine
  { id: 36, category: "Science Fiction", price: 499 },              // The War of the Worlds
  // Fantasy & Children's
  { id: 11, category: "Fantasy", price: 399, featured: true },      // Alice in Wonderland
  { id: 55, category: "Fantasy", price: 399 },                      // The Wonderful Wizard of Oz
  { id: 16, category: "Fantasy", price: 399 },                      // Peter Pan
  { id: 2591, category: "Fantasy", price: 499 },                    // Grimms' Fairy Tales
  // Philosophy & Non-fiction
  { id: 1232, category: "Philosophy", price: 499 },                 // The Prince
  { id: 2680, category: "Philosophy", price: 499 },                 // Meditations
  { id: 205, category: "Philosophy", price: 499 },                  // Walden
  // Poetry & Epics
  { id: 1727, category: "Poetry", price: 599 },                     // The Odyssey
]

const MAX_CONTENT_CHARS = 500_000

async function fetchWithTimeout(url, opts = {}, ms = 30_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(id) {
  const urls = [
    `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`,
    `https://www.gutenberg.org/files/${id}/${id}-0.txt`,
    `https://www.gutenberg.org/files/${id}/${id}.txt`,
  ]
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url)
      if (res.ok) {
        const text = await res.text()
        if (text && text.length > 1000) return text
      }
    } catch {
      // try next
    }
  }
  return null
}

async function coverExists(id) {
  const url = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD" }, 15_000)
    if (res.ok) return url
  } catch {
    // ignore
  }
  return null
}

// Runs async tasks with a bounded concurrency so we don't fire all requests at
// once but still finish quickly.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

// Extracts title + author from the Gutenberg header and strips boilerplate.
function parse(raw) {
  const titleMatch = raw.match(/Title:\s*(.+)/)
  const authorMatch = raw.match(/Author:\s*(.+)/)
  const title = titleMatch ? titleMatch[1].trim() : "Untitled"
  const author = authorMatch ? authorMatch[1].trim() : "Unknown"

  let body = raw
  const start = raw.match(/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i)
  const end = raw.match(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i)
  if (start) body = body.slice(start.index + start[0].length)
  if (end) {
    const endIdx = body.search(/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i)
    if (endIdx > 0) body = body.slice(0, endIdx)
  }

  // Normalize whitespace: collapse hard-wrapped lines into paragraphs.
  body = body
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  if (body.length > MAX_CONTENT_CHARS) {
    body = body.slice(0, MAX_CONTENT_CHARS)
  }

  // Build a short excerpt/description from the first substantive paragraphs.
  const paras = body
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 60)
  const excerpt = (paras[0] || body.slice(0, 300)).slice(0, 400)
  const description = paras.slice(0, 2).join(" ").slice(0, 600)

  return { title, author, body, excerpt, description }
}

const PALETTE = [
  ["#2f3e9e", "#f4b740"],
  ["#7c2d12", "#fbbf24"],
  ["#134e4a", "#5eead4"],
  ["#4c1d95", "#f0abfc"],
  ["#831843", "#fda4af"],
  ["#1e3a5f", "#7dd3fc"],
  ["#365314", "#bef264"],
  ["#7c2d12", "#fdba74"],
]

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  console.log("[seed] fetching", CATALOG.length, "books from Project Gutenberg…")

  const fetched = await mapWithConcurrency(CATALOG, 6, async (entry, i) => {
    const [raw, cover] = await Promise.all([
      fetchText(entry.id),
      coverExists(entry.id),
    ])
    if (!raw) {
      console.warn("[seed] skip", entry.id, "- no text")
      return null
    }
    const { title, author, body, excerpt, description } = parse(raw)
    const [coverColor, accentColor] = PALETTE[i % PALETTE.length]
    console.log(
      `[seed] ${title} — ${author} (${(body.length / 1000).toFixed(0)}k chars, cover: ${cover ? "yes" : "no"})`,
    )
    return {
      title,
      author,
      category: entry.category,
      description,
      excerpt,
      content: body,
      priceInCents: entry.price,
      coverImageUrl: cover,
      gutenbergId: entry.id,
      coverColor,
      accentColor,
      featured: Boolean(entry.featured),
    }
  })
  const rows = fetched.filter(Boolean)

  if (rows.length === 0) {
    throw new Error("No books fetched — aborting without touching the catalog.")
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    // Replace the placeholder catalog with the real one. Purchases cascade.
    await client.query("TRUNCATE TABLE book RESTART IDENTITY CASCADE")
    for (const r of rows) {
      await client.query(
        `INSERT INTO book (title, author, category, description, excerpt, content, "priceInCents", "coverImageUrl", "gutenbergId", "coverColor", "accentColor", featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          r.title,
          r.author,
          r.category,
          r.description,
          r.excerpt,
          r.content,
          r.priceInCents,
          r.coverImageUrl,
          r.gutenbergId,
          r.coverColor,
          r.accentColor,
          r.featured,
        ],
      )
    }
    await client.query("COMMIT")
    console.log(`[seed] done — inserted ${rows.length} books.`)
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err)
  process.exit(1)
})
