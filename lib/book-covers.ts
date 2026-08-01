/**
 * Resolves real book-cover artwork from legitimate public sources
 * (Open Library and Google Books). Returns a usable image URL or null — when
 * null, the UI renders our own branded cover card rather than a generic
 * Project Gutenberg placeholder.
 *
 * Intentionally NOT "server-only": it is pure `fetch` and is reused by the
 * offline backfill script as well as the in-app import pipeline.
 */

const UA = "Mozilla/5.0 (compatible; VoxyfiBookstore/1.0; +https://voxyfi.com)"

async function timedFetch(
  url: string,
  opts: RequestInit = {},
  ms = 10_000,
): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, {
      ...opts,
      headers: { "User-Agent": UA, ...(opts.headers || {}) },
      signal: controller.signal,
    })
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function cleanIsbn(isbn?: string | null): string | null {
  if (!isbn) return null
  const digits = isbn.replace(/[^0-9Xx]/g, "")
  return digits.length === 10 || digits.length === 13 ? digits : null
}

/** Open Library cover by ISBN. `default=false` makes it 404 when none exists. */
async function fromOpenLibraryIsbn(isbn: string): Promise<string | null> {
  const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`
  const res = await timedFetch(url, { method: "GET" }, 10_000)
  if (res && res.ok) {
    const type = res.headers.get("content-type") || ""
    const len = Number(res.headers.get("content-length") || "0")
    // A real cover is a sizable image; the blank placeholder is tiny.
    if (type.startsWith("image/") && (len === 0 || len > 3000)) return url
  }
  return null
}

/** Open Library search by title/author → numeric cover id. */
async function fromOpenLibrarySearch(
  title: string,
  author: string,
): Promise<string | null> {
  const params = new URLSearchParams({
    title,
    limit: "3",
    fields: "cover_i,title,author_name,language",
  })
  if (author && author !== "Unknown") params.set("author", author)
  const res = await timedFetch(
    `https://openlibrary.org/search.json?${params.toString()}`,
  )
  if (!res || !res.ok) return null
  const data = (await res.json().catch(() => null)) as {
    docs?: { cover_i?: number }[]
  } | null
  const withCover = data?.docs?.find((d) => typeof d.cover_i === "number")
  return withCover?.cover_i
    ? `https://covers.openlibrary.org/b/id/${withCover.cover_i}-L.jpg`
    : null
}

/** Google Books volume search → cover thumbnail (upscaled, https). */
async function fromGoogleBooks(
  title: string,
  author: string,
  isbn: string | null,
): Promise<string | null> {
  const q = isbn
    ? `isbn:${isbn}`
    : `intitle:${title}${author && author !== "Unknown" ? `+inauthor:${author}` : ""}`
  const res = await timedFetch(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3&country=US`,
  )
  if (!res || !res.ok) return null
  const data = (await res.json().catch(() => null)) as {
    items?: { volumeInfo?: { imageLinks?: Record<string, string> } }[]
  } | null
  for (const item of data?.items ?? []) {
    const links = item.volumeInfo?.imageLinks
    const raw = links?.thumbnail || links?.smallThumbnail
    if (raw) {
      // Normalize to a larger, secure image.
      return raw
        .replace(/^http:/, "https:")
        .replace(/&zoom=\d/, "")
        .replace(/&edge=curl/, "")
    }
  }
  return null
}

/**
 * Finds the best available real cover for a book. Tries ISBN-based lookups
 * first (most precise), then title/author search. Returns null when no
 * legitimate cover is found.
 */
export async function resolveRealCover(input: {
  title: string
  author?: string | null
  isbn?: string | null
}): Promise<string | null> {
  const title = (input.title || "").trim()
  const author = (input.author || "").trim()
  if (!title) return null
  const isbn = cleanIsbn(input.isbn)

  const strategies: Array<() => Promise<string | null>> = []
  if (isbn) {
    strategies.push(() => fromOpenLibraryIsbn(isbn))
    strategies.push(() => fromGoogleBooks(title, author, isbn))
  }
  strategies.push(() => fromOpenLibrarySearch(title, author))
  strategies.push(() => fromGoogleBooks(title, author, null))

  for (const strategy of strategies) {
    const url = await strategy()
    if (url) return url
  }
  return null
}
