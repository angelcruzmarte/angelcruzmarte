// Expands the native (in-app) catalog with real public-domain books in many
// languages. Discovery uses Project Gutenberg's official catalog feed
// (pg_catalog.csv.gz) — Gutendex blocks datacenter IPs, but the feed and the
// text files are reachable. For each language we take the lowest Text# ids
// (which are the canonical, most-downloaded classics), derive a category from
// the book's Subjects/Bookshelves, download the real full text (for in-app
// reading + TTS), and upsert by Gutenberg id.
//
// Idempotent AND resumable: Gutenberg ids already in the catalog are skipped
// entirely (no re-download), so this can run in several passes and keeps adding
// new titles without touching existing purchases/favorites. Run with:
//   node --env-file-if-exists=/vercel/share/.env.project scripts/seed-books-multilingual.mjs
//
// Optional env overrides:
//   SEED_LANGS=es,fr,de     (comma list of language codes)
//   SEED_PER_LANG=40        (target new books per language)
import { Pool } from "pg"
import zlib from "node:zlib"

const CATALOG_URL =
  "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz"

// Languages to seed (English is already covered by scripts/seed-books.mjs).
const DEFAULT_LANGUAGES = [
  { code: "es", label: "Spanish", target: 45 },
  { code: "fr", label: "French", target: 45 },
  { code: "de", label: "German", target: 45 },
  { code: "it", label: "Italian", target: 40 },
  { code: "pt", label: "Portuguese", target: 40 },
  { code: "nl", label: "Dutch", target: 30 },
  { code: "ru", label: "Russian", target: 25 },
  { code: "pl", label: "Polish", target: 20 },
  { code: "fi", label: "Finnish", target: 25 },
  { code: "sv", label: "Swedish", target: 20 },
  { code: "hu", label: "Hungarian", target: 18 },
  { code: "el", label: "Greek", target: 15 },
  { code: "la", label: "Latin", target: 15 },
  { code: "da", label: "Danish", target: 15 },
  { code: "eo", label: "Esperanto", target: 12 },
  { code: "cs", label: "Czech", target: 12 },
]

// Subject keyword -> catalog category (specific first). Matched against the
// book's Subjects + Bookshelves columns, case-insensitively.
const CATEGORY_RULES = [
  { category: "Mystery & Detective", keys: ["detective", "mystery"] },
  { category: "Science Fiction", keys: ["science fiction"] },
  { category: "Fantasy", keys: ["fantasy", "imaginary places"] },
  { category: "Horror", keys: ["horror", "ghost stories", "gothic"] },
  { category: "Adventure", keys: ["adventure", "sea stories"] },
  { category: "Historical Fiction", keys: ["historical fiction", "war stories"] },
  { category: "Romance", keys: ["love stories", "romance"] },
  { category: "Fairy Tales", keys: ["fairy tales", "folklore", "legends"] },
  { category: "Children's Fiction", keys: ["children", "juvenile"] },
  { category: "Poetry", keys: ["poetry", "poems"] },
  { category: "Drama & Plays", keys: ["drama", "plays", "theater", "theatre"] },
  { category: "Humor & Satire", keys: ["humor", "humour", "satire", "wit"] },
  { category: "Short Stories", keys: ["short stories"] },
  { category: "Philosophy", keys: ["philosophy", "ethics"] },
  { category: "Psychology", keys: ["psychology"] },
  { category: "Biography & Memoir", keys: ["biography", "autobiography", "correspondence"] },
  { category: "History", keys: ["history"] },
  { category: "Politics", keys: ["political science", "government"] },
  { category: "Religion & Spirituality", keys: ["religion", "christianity", "mythology", "bible"] },
  { category: "Science", keys: ["science", "physics", "astronomy", "natural history"] },
  { category: "Mathematics", keys: ["mathematics", "geometry"] },
  { category: "Economics", keys: ["economics", "finance", "political economy"] },
  { category: "Travel", keys: ["travel", "voyages"] },
  { category: "Nature & Environment", keys: ["botany", "zoology"] },
  { category: "Fiction", keys: ["fiction"] },
]

const PRICE_TIERS = [399, 499, 599, 699]
const MAX_CONTENT_CHARS = 500_000
const UA = "Mozilla/5.0 (compatible; VoxyfiBookstore/1.0; public-domain reader)"

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

async function fetchWithTimeout(url, opts = {}, ms = 25_000) {
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

// Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes ("") and
// embedded newlines/commas. Returns an array of string arrays.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (c === "\r") {
      // ignore; handled by \n
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

// "Last, First, 1830-1916" -> "First Last" (strip the year range).
function formatAuthor(raw) {
  if (!raw) return "Unknown"
  // Multiple authors are "; "-separated; use the first.
  const first = raw.split(";")[0].trim()
  const noYears = first.replace(/,\s*\d{3,4}(-\d{0,4})?\s*$/, "").trim()
  const m = noYears.match(/^([^,]+),\s*(.+)$/)
  return m ? `${m[2].trim()} ${m[1].trim()}` : noYears || "Unknown"
}

function categoryFor(subjects, bookshelves) {
  const hay = `${subjects} | ${bookshelves}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keys.some((k) => hay.includes(k))) return rule.category
  }
  return "Classics"
}

async function loadCatalog() {
  const res = await fetchWithTimeout(CATALOG_URL, {}, 60_000)
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
  const gz = Buffer.from(await res.arrayBuffer())
  const csv = zlib.gunzipSync(gz).toString("utf8")
  const rows = parseCsv(csv)
  const header = rows[0]
  const idx = (name) => header.indexOf(name)
  const iId = idx("Text#")
  const iType = idx("Type")
  const iTitle = idx("Title")
  const iLang = idx("Language")
  const iAuthors = idx("Authors")
  const iSubjects = idx("Subjects")
  const iShelves = idx("Bookshelves")
  const out = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length <= iShelves) continue
    if (row[iType] !== "Text") continue
    const id = Number(row[iId])
    if (!Number.isFinite(id) || id <= 0) continue
    out.push({
      id,
      title: (row[iTitle] || "").replace(/\s+/g, " ").trim(),
      // Language column can be "es" or occasionally "en; fr"; keep the list.
      langs: (row[iLang] || "")
        .split(/[;,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      author: formatAuthor(row[iAuthors]),
      category: categoryFor(row[iSubjects] || "", row[iShelves] || ""),
    })
  }
  return out
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

  body = body.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (body.length > MAX_CONTENT_CHARS) body = body.slice(0, MAX_CONTENT_CHARS)

  const paras = body
    .split(/\n\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 40)
  const excerpt = (paras[0] || body.slice(0, 300)).slice(0, 400)
  const description = paras.slice(0, 2).join(" ").slice(0, 600)
  return { title: fallbackTitle || title, author: author, body, excerpt, description }
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
  const langs = process.env.SEED_LANGS
    ? process.env.SEED_LANGS.split(",")
        .map((c) => c.trim())
        .filter(Boolean)
        .map(
          (code) =>
            DEFAULT_LANGUAGES.find((l) => l.code === code) ?? {
              code,
              label: code.toUpperCase(),
              target: 30,
            },
        )
    : DEFAULT_LANGUAGES
  const perLangOverride = Number(process.env.SEED_PER_LANG) || null

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })

  const existing = new Set(
    (
      await pool.query(
        `SELECT "gutenbergId" FROM book WHERE "gutenbergId" IS NOT NULL`,
      )
    ).rows.map((r) => Number(r.gutenbergId)),
  )
  console.log(`[seed-ml] catalog already has ${existing.size} Gutenberg titles`)

  console.log("[seed-ml] downloading Project Gutenberg catalog feed…")
  const catalog = await loadCatalog()
  console.log(`[seed-ml] catalog rows: ${catalog.length}`)

  // 1) Select candidates per language: lowest ids first (canonical classics),
  // skipping ids we already have and titles that look like indexes.
  const seen = new Set(existing)
  const selected = []
  for (const lang of langs) {
    const target = perLangOverride ?? lang.target
    const pool2 = catalog
      .filter((b) => b.langs.includes(lang.code) && b.title && b.title.length > 1)
      .sort((a, b) => a.id - b.id)
    let taken = 0
    for (const b of pool2) {
      if (taken >= target) break
      if (seen.has(b.id)) continue
      seen.add(b.id)
      selected.push({
        gutenbergId: b.id,
        title: b.title,
        author: b.author,
        category: b.category,
        language: lang.code,
        price: PRICE_TIERS[selected.length % PRICE_TIERS.length],
      })
      taken++
    }
    console.log(`[seed-ml]   ${lang.label} (${lang.code}): ${taken} candidates`)
  }

  if (selected.length === 0) {
    console.log("[seed-ml] nothing new to add.")
    await pool.end()
    return
  }

  console.log(`[seed-ml] downloading full text for ${selected.length} books…`)

  let done = 0
  const rows = (
    await mapWithConcurrency(selected, 12, async (entry, i) => {
      const raw = await fetchText(entry.gutenbergId)
      done++
      if (done % 25 === 0) console.log(`[seed-ml]   fetched ${done}/${selected.length}`)
      if (!raw) return null
      const { author, body, excerpt, description } = parse(
        raw,
        entry.title,
        entry.author,
      )
      if (!body || body.length < 2000) return null
      const cover = await coverUrlFor(entry.gutenbergId)
      const [coverColor, accentColor] = PALETTE[i % PALETTE.length]
      return {
        title: entry.title,
        author,
        category: entry.category,
        language: entry.language,
        description,
        excerpt,
        content: body,
        priceInCents: entry.price,
        coverImageUrl: cover,
        gutenbergId: entry.gutenbergId,
        coverColor,
        accentColor,
      }
    })
  ).filter(Boolean)

  if (rows.length === 0) {
    console.log("[seed-ml] no usable texts downloaded — catalog untouched.")
    await pool.end()
    return
  }

  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    for (const r of rows) {
      await client.query(
        `INSERT INTO book (title, author, category, language, description, excerpt, content, "priceInCents", "coverImageUrl", "gutenbergId", "coverColor", "accentColor")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT ("gutenbergId") WHERE "gutenbergId" IS NOT NULL
         DO UPDATE SET
           category = EXCLUDED.category,
           language = EXCLUDED.language,
           description = EXCLUDED.description,
           excerpt = EXCLUDED.excerpt,
           content = EXCLUDED.content,
           "coverImageUrl" = EXCLUDED."coverImageUrl"`,
        [
          r.title,
          r.author,
          r.category,
          r.language,
          r.description,
          r.excerpt,
          r.content,
          r.priceInCents,
          r.coverImageUrl,
          r.gutenbergId,
          r.coverColor,
          r.accentColor,
        ],
      )
    }
    await client.query("COMMIT")
    console.log(`[seed-ml] done — added ${rows.length} books across ${langs.length} languages.`)
  } catch (err) {
    await client.query("ROLLBACK")
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error("[seed-ml] failed:", err)
  process.exit(1)
})
