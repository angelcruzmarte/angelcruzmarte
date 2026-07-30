import { NextResponse } from "next/server"

import { affiliateBuyUrl } from "@/lib/affiliate"
import { resolveAffiliateSettings } from "@/lib/affiliate-settings"

// One page of live catalog results from Open Library.
const PAGE_SIZE = 24

export type StoreResult = {
  key: string
  title: string
  author: string
  year: number | null
  coverUrl: string | null
  gutenbergId: number | null
  // True when the full text can legally be read aloud in-app (public domain
  // with a Project Gutenberg source).
  listenable: boolean
  // Where to buy commercial titles we can't serve audio for.
  buyUrl: string
}

type OpenLibraryDoc = {
  key?: string
  title?: string
  author_name?: string[]
  cover_i?: number
  first_publish_year?: number
  id_project_gutenberg?: string[]
  ebook_access?: string
}

function mapDoc(
  doc: OpenLibraryDoc,
  affiliate: { tag: string; region: string },
): StoreResult | null {
  if (!doc.title) return null
  const author = doc.author_name?.[0] ?? "Unknown"
  const gutenbergId = doc.id_project_gutenberg?.length
    ? Number(doc.id_project_gutenberg[0])
    : null
  const listenable =
    doc.ebook_access === "public" &&
    gutenbergId !== null &&
    Number.isFinite(gutenbergId)

  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
    : gutenbergId
      ? `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.cover.medium.jpg`
      : null

  // Commercial titles link out to Amazon with our Associate tag applied.
  const buyUrl = affiliateBuyUrl({
    title: doc.title,
    author,
    tag: affiliate.tag,
    region: affiliate.region,
  })

  return {
    key: doc.key ?? `${doc.title}-${author}`,
    title: doc.title,
    author,
    year: doc.first_publish_year ?? null,
    coverUrl,
    gutenbergId,
    listenable,
    buyUrl,
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get("q") ?? "").trim()
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1)

  if (!q) {
    return NextResponse.json({ results: [], page, hasMore: false })
  }

  const fields = [
    "key",
    "title",
    "author_name",
    "cover_i",
    "first_publish_year",
    "id_project_gutenberg",
    "ebook_access",
  ].join(",")

  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
    `&page=${page}&limit=${PAGE_SIZE}&language=eng&fields=${fields}`

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VoxyfiBookstore/1.0 (books listening app)" },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      return NextResponse.json({ results: [], page, hasMore: false })
    }
    const data = (await res.json()) as {
      docs?: OpenLibraryDoc[]
      numFound?: number
      num_found?: number
    }
    const { tag, region } = await resolveAffiliateSettings()
    const results = (data.docs ?? [])
      .map((doc) => mapDoc(doc, { tag, region }))
      .filter((r): r is StoreResult => r !== null)
    const numFound = data.numFound ?? data.num_found ?? 0
    return NextResponse.json({
      results,
      page,
      hasMore: page * PAGE_SIZE < numFound,
    })
  } catch {
    return NextResponse.json({ results: [], page, hasMore: false })
  }
}
