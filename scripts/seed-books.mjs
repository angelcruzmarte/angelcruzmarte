// Seeds the book catalog across many categories from real public-domain
// sources. For each category we ask Open Library for popular public-domain
// titles that have a Project Gutenberg id, then download the real full text
// from Project Gutenberg (used for in-app reading + text-to-speech).
//
// The seed is idempotent: books are upserted by their Gutenberg id, so existing
// purchases and favorites are preserved. Run with:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/seed-books.mjs
import { Pool } from "pg"

// Category label -> Open Library subject key. Ordered specific -> broad so that
// when a popular title appears under several subjects it is assigned to the
// most specific category (first one wins via global de-duplication).
const CATEGORIES = [
  // Fiction
  { name: "Mystery & Detective", subject: "detective_and_mystery_stories", target: 7 },
  { name: "Science Fiction", subject: "science_fiction", target: 7 },
  { name: "Fantasy", subject: "fantasy_fiction", target: 7 },
  { name: "Horror", subject: "horror_tales", target: 6 },
  { name: "Adventure", subject: "adventure_stories", target: 7 },
  { name: "Historical Fiction", subject: "historical_fiction", target: 6 },
  { name: "Romance", subject: "love_stories", target: 7 },
  { name: "Thriller & Suspense", subject: "adventure_and_adventurers", target: 5 },
  { name: "Short Stories", subject: "short_stories", target: 6 },
  { name: "Poetry", subject: "poetry", target: 7 },
  { name: "Classics", subject: "classical_literature", target: 8 },
  // Nonfiction
  { name: "Philosophy", subject: "philosophy", target: 7 },
  { name: "Psychology", subject: "psychology", target: 5 },
  { name: "Biography & Memoir", subject: "biography", target: 7 },
  { name: "History", subject: "world_history", target: 8 },
  { name: "Politics", subject: "political_science", target: 5 },
  { name: "Religion & Spirituality", subject: "religion", target: 6 },
  { name: "Science", subject: "natural_science", target: 4 },
  { name: "Mathematics", subject: "mathematics", target: 5 },
  { name: "Economics", subject: "economics", target: 5 },
  { name: "Travel", subject: "voyages_and_travels", target: 5 },
  { name: "Nature & Environment", subject: "natural_history", target: 4 },
  { name: "Self-Help", subject: "success", target: 6 },
  // Children's
  { name: "Children's Fiction", subject: "juvenile_fiction", target: 8 },
  { name: "Fairy Tales", subject: "fairy_tales", target: 6 },
]

const PRICE_TIERS = [399, 499, 599, 699]
const MAX_CONTENT_CHARS = 500_000
const UA = "VoxyfiBookstore/1.0 (public-domain books listening app)"

async function fetchWithTimeout(url, opts = {}, ms = 30_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      ...opts,
      headers: { "User-Agent": UA, ...(opts.headers || {}) },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

// Asks Open Library for popular public-domain books in a subject that expose a
// Project Gutenberg id (so we can fetch the real full text).
async function findBooksForSubject(subject, limit = 50) {
  const fields = [
    "title",
    "author_name",
    "cover_i",
    "id_project_gutenberg",
    "ebook_access",
    "first_publish_year",
  ].join(",")
  const url =
    `https://openlibrary.org/search.json?q=subject:${subject}+ebook_access:public` +
    `&limit=${limit}&language=eng&sort=readinglog&fields=${fields}`
  try {
    const res = await fetchWithTimeout(url, {}, 20_000)
    if (!res.ok) return []
    const data = await res.json()
    return (data.docs ?? [])
      .map((d) => {
        const pg = d.id_project_gutenberg?.length
          ? Number(d.id_project_gutenberg[0])
          : null
        if (!pg || !Number.isFinite(pg)) return null
        return {
          title: d.title,
          author: d.author_name?.[0] ?? "Unknown",
          gutenbergId: pg,
          coverI: d.cover_i ?? null,
        }
      })
      .filter(Boolean)
  } catch {
    return []
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
      // try next mirror
    }
  }
  return null
}

// Extracts title + author from the Gutenberg header and strips boilerplate.
function parse(raw, fallbackTitle, fallbackAuthor) {
  const titleMatch = raw.match(/Title:\s*(.+)/)
  const authorMatch = raw.match(/Author:\s*(.+)/)
  const title = (titleMatch ? titleMatch[1].trim() : fallbackTitle) || "Untitled"
  const author =
    (authorMatch ? authorMatch[1].trim() : fallbackAuthor) || "Unknown"

  let body = raw
  const start = raw.match(
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i,
  )
  if (start) body = body.slice(start.index + start[0].length)
  const endIdx = body.search(
    /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i,
  )
  if (endIdx > 0) body = body.slice(0, endIdx)

  body = body
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (body.length > MAX_CONTENT_CHARS) body = body.slice(0, MAX_CONTENT_CHARS)

  const paras = body
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 60)
  const excerpt = (paras[0] || body.slice(0, 300)).slice(0, 400)
  const description = paras.slice(0, 2).join(" ").slice(0, 600)

  return { title, author, body, excerpt, description }
}

async function coverUrlFor(coverI, gutenbergId) {
  if (coverI) return `https://covers.openlibrary.org/b/id/${coverI}-L.jpg`
  const gut = `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
  try {
    const res = await fetchWithTimeout(gut, { method: "HEAD" }, 12_000)
    if (res.ok) return gut
  } catch {
    // ignore
  }
  return null
}

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
  // 1) Discover candidate books per category from Open Library.
  console.log("[seed] discovering books across", CATEGORIES.length, "categories…")
  const seen = new Set() // global de-dupe by Gutenberg id
  const selected = [] // { title, author, gutenbergId, coverI, category, price, featured }

  for (const cat of CATEGORIES) {
    const found = await findBooksForSubject(cat.subject)
    let taken = 0
    for (const b of found) {
      if (taken >= cat.target) break
      if (seen.has(b.gutenbergId)) continue
      seen.add(b.gutenbergId)
      selected.push({
        ...b,
        category: cat.name,
        price: PRICE_TIERS[selected.length % PRICE_TIERS.length],
        // Feature the top pick of the first several marquee categories.
        featured: taken === 0 && selected.length < 60 && cat.target >= 6,
      })
      taken++
    }
    console.log(`[seed]   ${cat.name}: ${taken} books`)
    await new Promise((r) => setTimeout(r, 150)) // be polite to Open Library
  }

  console.log(`[seed] downloading full text for ${selected.length} books…`)

  // 2) Download + parse full text for each selection.
  const rows = (
    await mapWithConcurrency(selected, 8, async (entry, i) => {
      const raw = await fetchText(entry.gutenbergId)
      if (!raw) {
        console.warn("[seed]   skip", entry.gutenbergId, "-", entry.title, "(no text)")
        return null
      }
      const { title, author, body, excerpt, description } = parse(
        raw,
        entry.title,
        entry.author,
      )
      const cover = await coverUrlFor(entry.coverI, entry.gutenbergId)
      const [coverColor, accentColor] = PALETTE[i % PALETTE.length]
      return {
        title,
        author,
        category: entry.category,
        description,
        excerpt,
        content: body,
        priceInCents: entry.price,
        coverImageUrl: cover,
        gutenbergId: entry.gutenbergId,
        coverColor,
        accentColor,
        featured: entry.featured,
      }
    })
  ).filter(Boolean)

  if (rows.length === 0) {
    throw new Error("No books fetched — aborting without touching the catalog.")
  }

  // 3) Upsert by Gutenberg id (preserves purchases + favorites).
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const r of rows) {
      await client.query(
        `INSERT INTO book (title, author, category, description, excerpt, content, "priceInCents", "coverImageUrl", "gutenbergId", "coverColor", "accentColor", featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT ("gutenbergId") WHERE "gutenbergId" IS NOT NULL
         DO UPDATE SET
           title = EXCLUDED.title,
           author = EXCLUDED.author,
           category = EXCLUDED.category,
           description = EXCLUDED.description,
           excerpt = EXCLUDED.excerpt,
           content = EXCLUDED.content,
           "priceInCents" = EXCLUDED."priceInCents",
           "coverImageUrl" = EXCLUDED."coverImageUrl",
           "coverColor" = EXCLUDED."coverColor",
           "accentColor" = EXCLUDED."accentColor",
           featured = EXCLUDED.featured`,
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
    console.log(`[seed] done — upserted ${rows.length} books.`)
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
