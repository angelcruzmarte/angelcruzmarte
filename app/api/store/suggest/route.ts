import { NextResponse } from "next/server"

// Lightweight typeahead for the store search bar. Returns a small set of
// title/author suggestions from Open Library so the search can autocomplete
// as the user types a couple of words.

export type Suggestion = {
  title: string
  author: string
  coverUrl: string | null
  listenable: boolean
}

type OpenLibraryDoc = {
  title?: string
  author_name?: string[]
  cover_i?: number
  id_project_gutenberg?: string[]
  ebook_access?: string
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const fields = [
    "title",
    "author_name",
    "cover_i",
    "id_project_gutenberg",
    "ebook_access",
  ].join(",")

  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
    `&limit=8&language=eng&fields=${fields}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VoxyfiBookstore/1.0 (books listening app)" },
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      return NextResponse.json({ suggestions: [] })
    }
    const data = (await res.json()) as { docs?: OpenLibraryDoc[] }

    const seen = new Set<string>()
    const suggestions: Suggestion[] = []
    for (const doc of data.docs ?? []) {
      if (!doc.title) continue
      const author = doc.author_name?.[0] ?? "Unknown"
      const key = `${doc.title.toLowerCase()}|${author.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)

      const gutenbergId = doc.id_project_gutenberg?.length
        ? Number(doc.id_project_gutenberg[0])
        : null
      const listenable =
        doc.ebook_access === "public" &&
        gutenbergId !== null &&
        Number.isFinite(gutenbergId)

      suggestions.push({
        title: doc.title,
        author,
        coverUrl: doc.cover_i
          ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-S.jpg`
          : null,
        listenable,
      })
      if (suggestions.length >= 6) break
    }

    return NextResponse.json({ suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}
