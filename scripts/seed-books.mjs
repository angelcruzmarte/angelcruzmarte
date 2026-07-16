// Seeds the book catalog across many categories from real public-domain
// sources. For each category we ask Gutendex (a JSON API over the full Project
// Gutenberg catalog) for popular titles matching a topic, then download the
// real full text from Project Gutenberg (used for in-app reading + TTS).
//
// The seed is idempotent: books are upserted by their Gutenberg id, so existing
// purchases and favorites are preserved. Run with:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/seed-books.mjs
import { Pool } from "pg"

// Category label -> Gutendex topic keyword(s). Gutendex matches topics against
// Gutenberg's own subject + bookshelf taxonomy (case-insensitive, partial), so
// even niche nonfiction categories return plenty of real public-domain titles.
// Multiple topics are tried in order until the target is reached. Ordered so
// that more specific categories claim shared titles first (global de-dupe).
const CATEGORIES = [
  // Fiction
  { name: "Mystery & Detective", topics: ["detective", "mystery"], target: 24 },
  { name: "Science Fiction", topics: ["science fiction"], target: 24 },
  { name: "Fantasy", topics: ["fantasy", "imaginary places"], target: 24 },
  { name: "Horror", topics: ["horror", "ghost stories", "gothic"], target: 22 },
  { name: "Adventure", topics: ["adventure", "sea stories"], target: 24 },
  { name: "Historical Fiction", topics: ["historical fiction", "war stories"], target: 22 },
  { name: "Romance", topics: ["love stories", "romance"], target: 24 },
  { name: "Thriller & Suspense", topics: ["spies", "crime", "adventure stories"], target: 20 },
  { name: "Short Stories", topics: ["short stories"], target: 22 },
  { name: "Poetry", topics: ["poetry"], target: 24 },
  { name: "Classics", topics: ["best books ever listings", "harvard classics"], target: 24 },
  { name: "Drama & Plays", topics: ["drama", "plays"], target: 20 },
  { name: "Humor & Satire", topics: ["humor", "satire", "wit"], target: 18 },
  // Children's — before broad nonfiction so juvenile titles aren't taken first.
  { name: "Children's Fiction", topics: ["children's", "juvenile fiction"], target: 24 },
  { name: "Fairy Tales", topics: ["fairy tales", "folklore", "legends"], target: 22 },
  // Nonfiction
  { name: "Philosophy", topics: ["philosophy", "ethics"], target: 22 },
  { name: "Psychology", topics: ["psychology", "mind"], target: 18 },
  { name: "Biography & Memoir", topics: ["biography", "autobiography"], target: 22 },
  { name: "History", topics: ["history"], target: 24 },
  { name: "Politics", topics: ["political science", "government"], target: 18 },
  { name: "Religion & Spirituality", topics: ["religion", "christianity", "mythology"], target: 20 },
  { name: "Science", topics: ["science", "physics", "astronomy", "natural history"], target: 18 },
  { name: "Mathematics", topics: ["mathematics", "geometry"], target: 16 },
  { name: "Economics", topics: ["economics", "finance", "political economy"], target: 16 },
  { name: "Travel", topics: ["travel", "voyages and travels"], target: 18 },
  { name: "Nature & Environment", topics: ["natural history", "botany", "zoology"], target: 16 },
  { name: "Self-Help", topics: ["conduct of life", "success", "character"], target: 20 },
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

// Asks Gutendex for popular English public-domain books matching a topic. Every
// result carries a Project Gutenberg id (so we can fetch real full text) and a
// direct text/plain URL. Paginates until `want` usable books are collected.
async function findBooksForTopic(topic, want = 40) {
  const out = []
  let url =
    `https://gutendex.com/books?topic=${encodeURIComponent(topic)}` +
    `&languages=en&mime_type=text%2Fplain&sort=popular`
  // Gutendex returns 32/page; fetch a few pages to comfortably exceed `want`.
  for (let page = 0; page < 4 && url && out.length < want * 2; page++) {
    try {
      const res = await fetchWithTimeout(url, {}, 20_000)
      if (!res.ok) break
      const data = await res.json()
      for (const d of data.results ?? []) {
        const pg = Number(d.id)
        if (!pg || !Number.isFinite(pg)) continue
        // Prefer a plain-text format URL (skip zipped variants).
        const formats = d.formats ?? {}
        const textUrl = Object.entries(formats).find(
          ([k, v]) =>
            k.startsWith("text/plain") && !String(v).endsWith(".zip"),
        )?.[1]
        out.push({
          title: d.title,
          author: d.authors?.[0]?.name
            ? formatAuthor(d.authors[0].name)
            : "Unknown",
          gutenbergId: pg,
          coverI: null,
          textUrl: typeof textUrl === "string" ? textUrl : null,
        })
      }
      url = data.next
      await new Promise((r) => setTimeout(r, 120))
    } catch {
      break
    }
  }
  return out
}

// Gutendex authors are "Last, First"; flip to "First Last" for display.
function formatAuthor(name) {
  const m = name.match(/^([^,]+),\s*(.+)$/)
  return m ? `${m[2].trim()} ${m[1].trim()}` : name.trim()
}

async function fetchText(id, preferredUrl = null) {
  const urls = [
    ...(preferredUrl ? [preferredUrl] : []),
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
    let taken = 0
    // Try each topic for this category in order until we hit the target.
    for (const topic of cat.topics) {
      if (taken >= cat.target) break
      const found = await findBooksForTopic(topic, cat.target)
      for (const b of found) {
        if (taken >= cat.target) break
        if (seen.has(b.gutenbergId)) continue
        seen.add(b.gutenbergId)
        selected.push({
          ...b,
          category: cat.name,
          price: PRICE_TIERS[selected.length % PRICE_TIERS.length],
          // Feature the top pick of the first several marquee categories.
          featured: taken === 0 && selected.length < 60 && cat.target >= 20,
        })
        taken++
      }
    }
    console.log(`[seed]   ${cat.name}: ${taken} books`)
  }

  console.log(`[seed] downloading full text for ${selected.length} books…`)

  // 2) Download + parse full text for each selection.
  const rows = (
    await mapWithConcurrency(selected, 8, async (entry, i) => {
      const raw = await fetchText(entry.gutenbergId, entry.textUrl)
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
