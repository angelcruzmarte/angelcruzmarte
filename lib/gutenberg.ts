import "server-only"

const MAX_CONTENT_CHARS = 500_000

export type ParsedGutenbergBook = {
  title: string
  author: string
  body: string
  excerpt: string
  description: string
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  ms = 20_000,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Fetches the raw plain-text of a Project Gutenberg ebook, trying mirrors. */
async function fetchRawText(id: number): Promise<string | null> {
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

/** Medium cover image served by Project Gutenberg for a given ebook id. */
export function gutenbergCoverUrl(id: number): string {
  return `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`
}

/** Extracts title/author from the header and strips PG boilerplate. */
function parse(raw: string): ParsedGutenbergBook {
  const titleMatch = raw.match(/Title:\s*(.+)/)
  const authorMatch = raw.match(/Author:\s*(.+)/)
  const title = titleMatch ? titleMatch[1].trim() : "Untitled"
  const author = authorMatch ? authorMatch[1].trim() : "Unknown"

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

/**
 * Downloads and parses a Project Gutenberg ebook into the fields our catalog
 * needs. Returns null if the text can't be fetched.
 */
export async function fetchAndParseGutenberg(
  id: number,
): Promise<ParsedGutenbergBook | null> {
  const raw = await fetchRawText(id)
  if (!raw) return null
  return parse(raw)
}
