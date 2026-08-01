// Tops up thin categories with a curated set of famous public-domain titles.
// Open Library's subject search is sparse for niche nonfiction, so these
// hand-verified Project Gutenberg IDs guarantee real depth everywhere.
//
// Safe + idempotent: inserts with ON CONFLICT ("gutenbergId") DO NOTHING, so it
// only adds books that aren't already in the catalog and never moves or alters
// existing books, purchases, or favorites. Run with:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/topup-books.mjs
import { Pool } from "pg"

// Category -> verified Gutenberg IDs (all confirmed to resolve to the right
// title/author). Books already present (by gutenbergId) are skipped.
const CURATED = {
  "Children's Fiction": [11, 12, 16, 74, 76, 113, 289, 236, 271, 45, 55, 146, 514, 479],
  Classics: [1342, 1400, 2701, 768, 2600, 1399, 2554, 28054, 4300, 6130, 1727],
  Science: [1228, 2009, 944, 14474, 2300, 30155, 37729, 13476, 20417],
  Mathematics: [201, 27635, 16713, 22599],
  "Nature & Environment": [205, 1408, 1022, 3031, 4511, 5199],
  Psychology: [15489, 16287, 55262, 2529, 38219],
  Economics: [3300, 61, 33310, 4239, 15776, 55308, 30107],
  "Thriller & Suspense": [155, 863, 1155, 61262, 2852],
}

const PRICE_TIERS = [399, 499, 599, 699]
const MAX_CONTENT_CHARS = 500_000
const UA = "VoxyfiBookstore/1.0 (public-domain books listening app)"

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

function parse(raw) {
  const title = raw.match(/Title:\s*(.+)/)?.[1]?.trim() || "Untitled"
  const author = raw.match(/Author:\s*(.+)/)?.[1]?.trim() || "Unknown"

  let body = raw
  const start = raw.match(
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i,
  )
  if (start) body = body.slice(start.index + start[0].length)
  const endIdx = body.search(
    /\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i,
  )
  if (endIdx > 0) body = body.slice(0, endIdx)

  body = body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (body.length > MAX_CONTENT_CHARS) body = body.slice(0, MAX_CONTENT_CHARS)

  const paras = body
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 60)
  const excerpt = (paras[0] || body.slice(0, 300)).slice(0, 400)
  const description = paras.slice(0, 2).join(" ").slice(0, 600)

  return { title, author, body, excerpt, description }
}

async function coverUrlFor(id) {
  const gut = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

async function main() {
  const entries = []
  for (const [category, ids] of Object.entries(CURATED)) {
    ids.forEach((gutenbergId, i) => {
      entries.push({
        gutenbergId,
        category,
        price: PRICE_TIERS[(entries.length + i) % PRICE_TIERS.length],
      })
    })
  }

  console.log(`[topup] fetching full text for ${entries.length} curated books…`)
  const rows = (
    await mapWithConcurrency(entries, 8, async (entry, i) => {
      const raw = await fetchText(entry.gutenbergId)
      if (!raw) {
        console.warn("[topup]   skip", entry.gutenbergId, "(no text)")
        return null
      }
      const { title, author, body, excerpt, description } = parse(raw)
      const cover = await coverUrlFor(entry.gutenbergId)
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
        featured: false,
      }
    })
  ).filter(Boolean)

  if (rows.length === 0) {
    throw new Error("No books fetched — aborting.")
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  let inserted = 0
  try {
    await client.query("BEGIN")
    for (const r of rows) {
      // DO NOTHING: never touch books already in the catalog.
      const res = await client.query(
        `INSERT INTO book (title, author, category, description, excerpt, content, "priceInCents", "coverImageUrl", "gutenbergId", "coverColor", "accentColor", featured)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT ("gutenbergId") WHERE "gutenbergId" IS NOT NULL DO NOTHING`,
        [
          r.title, r.author, r.category, r.description, r.excerpt, r.content,
          r.priceInCents, r.coverImageUrl, r.gutenbergId, r.coverColor,
          r.accentColor, r.featured,
        ],
      )
      inserted += res.rowCount ?? 0
    }
    await client.query("COMMIT")
    console.log(`[topup] done — inserted ${inserted} new books (skipped ${rows.length - inserted} already present).`)
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[topup] failed:", err)
  process.exit(1)
})
