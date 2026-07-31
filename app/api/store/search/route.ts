import { NextResponse } from "next/server"

import { affiliateBuyUrl } from "@/lib/affiliate"
import { resolveAffiliateSettings } from "@/lib/affiliate-settings"

// One page of live catalog results from Open Library.
const PAGE_SIZE = 24

// Maps our 2-letter store language codes to Open Library's 3-letter language
// codes, so the store's language filter is honored for live search too. Codes
// not in this map (or "all") fall back to an unfiltered, cross-language search.
const OPEN_LIBRARY_LANG: Record<string, string> = {
  en: "eng",
  es: "spa",
  fr: "fre",
  de: "ger",
  it: "ita",
  pt: "por",
  nl: "dut",
  hi: "hin",
  zh: "chi",
  ja: "jpn",
  ko: "kor",
  ar: "ara",
  ru: "rus",
  tr: "tur",
  pl: "pol",
  sv: "swe",
  fi: "fin",
  da: "dan",
  hu: "hun",
  el: "gre",
  la: "lat",
  cs: "cze",
  eo: "epo",
}

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

  // Prefer a real, high-resolution Open Library cover. When none exists we
  // return null so the UI renders its own on-brand branded card instead of a
  // generic Project Gutenberg placeholder image (which is often low quality).
  const coverUrl = doc.cover_i
    ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
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

  // Respect the store's language filter. "en" maps to English; a specific
  // language restricts results to that language; "all"/unknown searches
  // everything.
  const langCode = (searchParams.get("lang") ?? "en").trim().toLowerCase()
  const olLang = OPEN_LIBRARY_LANG[langCode]
  const langQuery = olLang ? `&language=${olLang}` : ""

  const url =
    `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}` +
    `&page=${page}&limit=${PAGE_SIZE}${langQuery}&fields=${fields}`

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
