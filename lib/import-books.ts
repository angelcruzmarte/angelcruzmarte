import "server-only"

import { db } from "@/lib/db"
import { book } from "@/lib/db/schema"
import { isNotNull } from "drizzle-orm"
import zlib from "node:zlib"

// Automatic native-store importer. Discovery uses Project Gutenberg's official
// catalog feed (pg_catalog.csv.gz), which always reflects the *current* public
// catalog — so as new public-domain titles are released they become eligible
// here automatically. This module is the shared core used by the scheduled
// import cron; it mirrors scripts/seed-books-multilingual.mjs but runs inside
// the app (Drizzle + audit-aware) and is capped per run.

const CATALOG_URL =
  "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv.gz"

// Languages the native store carries. Each run distributes its budget across
// these round-robin so no single language dominates.
export const IMPORT_LANGUAGES = [
  "en", "es", "fr", "de", "it", "pt", "nl", "ru", "pl", "fi",
  "sv", "hu", "el", "la", "da", "eo", "cs",
] as const

// Subject keyword -> catalog category (specific first). Matched against the
// book's Subjects + Bookshelves columns, case-insensitively. Kept in sync with
// the seed script so manual and automatic imports categorize identically.
const CATEGORY_RULES: { category: string; keys: string[] }[] = [
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
const PALETTE: [string, string][] = [
  ["#2f3e9e", "#f4b740"], ["#7c2d12", "#fbbf24"], ["#134e4a", "#5eead4"],
  ["#4c1d95", "#f0abfc"], ["#831843", "#fda4af"], ["#1e3a5f", "#7dd3fc"],
  ["#365314", "#bef264"], ["#7c2d12", "#fdba74"],
]

type CatalogEntry = {
  id: number
  title: string
  langs: string[]
  author: string
  category: string
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 25_000,
): Promise<Response> {
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
// embedded newlines/commas.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (c === "\r") {
      // ignore
    } else field += c
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function formatAuthor(raw: string): string {
  if (!raw) return "Unknown"
  const first = raw.split(";")[0].trim()
  const noYears = first.replace(/,\s*\d{3,4}(-\d{0,4})?\s*$/, "").trim()
  const m = noYears.match(/^([^,]+),\s*(.+)$/)
  return m ? `${m[2].trim()} ${m[1].trim()}` : noYears || "Unknown"
}

function categoryFor(subjects: string, bookshelves: string): string {
  const hay = `${subjects} | ${bookshelves}`.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    if (rule.keys.some((k) => hay.includes(k))) return rule.category
  }
  return "Classics"
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  const res = await fetchWithTimeout(CATALOG_URL, {}, 60_000)
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
  const gz = Buffer.from(await res.arrayBuffer())
  const csv = zlib.gunzipSync(gz).toString("utf8")
  const rows = parseCsv(csv)
  const header = rows[0]
  const idx = (name: string) => header.indexOf(name)
  const iId = idx("Text#")
  const iType = idx("Type")
  const iTitle = idx("Title")
  const iLang = idx("Language")
  const iAuthors = idx("Authors")
  const iSubjects = idx("Subjects")
  const iShelves = idx("Bookshelves")
  const out: CatalogEntry[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length <= iShelves) continue
    if (row[iType] !== "Text") continue
    const id = Number(row[iId])
    if (!Number.isFinite(id) || id <= 0) continue
    out.push({
      id,
      title: (row[iTitle] || "").replace(/\s+/g, " ").trim(),
      langs: (row[iLang] || "")
        .split(/[;,]/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      author: formatAuthor(row[iAuthors] || ""),
      category: categoryFor(row[iSubjects] || "", row[iShelves] || ""),
    })
  }
  return out
}

async function fetchText(id: number): Promise<string | null> {
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

function parseText(
  raw: string,
  fallbackTitle: string,
  fallbackAuthor: string,
): { author: string; body: string; excerpt: string; description: string } {
  const authorMatch = raw.match(/Author:\s*(.+)/)
  const author = (authorMatch ? authorMatch[1].trim() : fallbackAuthor) || "Unknown"

  let body = raw
  const start = raw.match(
    /\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*\*\*/i,
  )
  if (start && start.index !== undefined) {
    body = body.slice(start.index + start[0].length)
  }
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
  return { author, body, excerpt, description }
}

async function coverUrlFor(id: number): Promise<string | null> {
  const gut = `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`
  try {
    const res = await fetchWithTimeout(gut, { method: "HEAD" }, 12_000)
    if (res.ok) return gut
  } catch {
    // ignore
  }
  return null
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
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

export type ImportResult = {
  added: number
  candidates: number
  byLanguage: Record<string, number>
  titles: string[]
}

/**
 * Imports up to `limit` NEW public-domain titles into the native store,
 * distributing the budget round-robin across IMPORT_LANGUAGES and picking the
 * lowest Text# ids first (the canonical, best-known works). Titles already in
 * the catalog (by Gutenberg id) are skipped, so this is safe to run repeatedly
 * and simply keeps adding what's newly available. Imported books are published
 * immediately when `autoPublish` is true (default).
 */
export async function importNewBooks(opts?: {
  limit?: number
  autoPublish?: boolean
}): Promise<ImportResult> {
  const limit = Math.max(1, opts?.limit ?? 100)
  const autoPublish = opts?.autoPublish ?? true

  // Known Gutenberg ids already in the catalog (dedupe set).
  const existingRows = await db
    .select({ gutenbergId: book.gutenbergId })
    .from(book)
    .where(isNotNull(book.gutenbergId))
  const existing = new Set(existingRows.map((r) => Number(r.gutenbergId)))

  const catalog = await loadCatalog()

  // Pre-bucket catalog entries per language, lowest-id-first.
  const buckets = new Map<string, CatalogEntry[]>()
  for (const lang of IMPORT_LANGUAGES) {
    buckets.set(
      lang,
      catalog
        .filter(
          (b) => b.langs.includes(lang) && b.title && b.title.length > 1,
        )
        .sort((a, b) => a.id - b.id),
    )
  }

  // Round-robin selection across languages until we hit the budget.
  const seen = new Set(existing)
  const selected: {
    gutenbergId: number
    title: string
    author: string
    category: string
    language: string
    price: number
  }[] = []
  const cursors = new Map<string, number>(
    IMPORT_LANGUAGES.map((l) => [l, 0]),
  )
  let exhausted = false
  while (selected.length < limit && !exhausted) {
    exhausted = true
    for (const lang of IMPORT_LANGUAGES) {
      if (selected.length >= limit) break
      const list = buckets.get(lang) || []
      let i = cursors.get(lang) || 0
      while (i < list.length && seen.has(list[i].id)) i++
      if (i < list.length) {
        const b = list[i]
        seen.add(b.id)
        selected.push({
          gutenbergId: b.id,
          title: b.title,
          author: b.author,
          category: b.category,
          language: lang,
          price: PRICE_TIERS[selected.length % PRICE_TIERS.length],
        })
        cursors.set(lang, i + 1)
        exhausted = false
      } else {
        cursors.set(lang, list.length)
      }
    }
  }

  if (selected.length === 0) {
    return { added: 0, candidates: 0, byLanguage: {}, titles: [] }
  }

  // Download and parse full text (concurrent, bounded).
  const rows = (
    await mapWithConcurrency(selected, 10, async (entry, i) => {
      const raw = await fetchText(entry.gutenbergId)
      if (!raw) return null
      const { author, body, excerpt, description } = parseText(
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
        fulfillment: "in_app" as const,
        published: autoPublish,
      }
    })
  ).filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length === 0) {
    return {
      added: 0,
      candidates: selected.length,
      byLanguage: {},
      titles: [],
    }
  }

  // Insert; ON CONFLICT DO NOTHING guards against a race with a concurrent run
  // (the partial unique index on gutenbergId enforces dedupe at the DB level).
  const inserted = await db
    .insert(book)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: book.id, title: book.title, language: book.language })

  const byLanguage: Record<string, number> = {}
  for (const r of inserted) {
    byLanguage[r.language] = (byLanguage[r.language] ?? 0) + 1
  }

  return {
    added: inserted.length,
    candidates: selected.length,
    byLanguage,
    titles: inserted.map((r) => r.title),
  }
}
