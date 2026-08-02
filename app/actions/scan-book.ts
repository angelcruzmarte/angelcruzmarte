"use server"

import { eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { book } from "@/lib/db/schema"
import { resolveRealCover } from "@/lib/book-covers"
import { dedupeKey, normalizeAuthor, normalizeTitle } from "@/lib/book-quality"
import { affiliateFormatsForBook } from "@/lib/affiliate-settings"
import type { AmazonFormatLink } from "@/lib/affiliate"
import { getCurrentUser } from "@/lib/session"
import { identifyBookFromCover } from "./ai"
import { importGutenbergBook } from "./books"

/**
 * A fully-serializable book candidate produced by a cover scan. It carries
 * everything the result sheet needs to render actions WITHOUT having written a
 * catalog row yet — a row is only created on demand by `ensureScannedBook` when
 * the user actually opens details, wishlists, adds to their library, or shops.
 */
export interface ScanMatch {
  /** True when the book already exists in the VOXYFI catalog. */
  inCatalog: boolean
  /** Catalog id when `inCatalog`; otherwise null until a row is created. */
  bookId: number | null
  title: string
  author: string
  isbn: string | null
  year: number | null
  coverUrl: string | null
  description: string
  /** True for public-domain titles that can be read & listened to for free. */
  listenable: boolean
  /** Project Gutenberg id backing a listenable public-domain title. */
  gutenbergId: number | null
  /** "in_app" for public-domain/owned catalog titles, else "affiliate". */
  fulfillment: "in_app" | "affiliate"
  confidence: "high" | "medium" | "low"
  /** Amazon buy links (Kindle → Audible → Print), tag applied server-side. */
  amazonFormats: AmazonFormatLink[]
}

export type ScanResult = { match: ScanMatch } | { error: string }

/** Serializable payload the client sends back to create a row on demand. */
export interface EnsureBookInput {
  bookId: number | null
  title: string
  author: string
  isbn: string | null
  year: number | null
  coverUrl: string | null
  description: string
  listenable: boolean
  gutenbergId: number | null
  fulfillment: "in_app" | "affiliate"
}

type OpenLibraryDoc = {
  cover_i?: number
  first_publish_year?: number
  id_project_gutenberg?: string[]
  ebook_access?: string
}

async function timedJson<T>(url: string, ms = 10_000): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VoxyfiBookstore/1.0 (books listening app)" },
      signal: AbortSignal.timeout(ms),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Looks up Open Library for public-domain availability + edition metadata. */
async function openLibraryMeta(
  title: string,
  author: string,
): Promise<{ year: number | null; gutenbergId: number | null; listenable: boolean }> {
  const params = new URLSearchParams({
    title,
    limit: "3",
    fields: "first_publish_year,id_project_gutenberg,ebook_access",
  })
  if (author && author !== "Unknown") params.set("author", author)
  const data = await timedJson<{ docs?: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?${params.toString()}`,
  )
  const doc = data?.docs?.[0]
  if (!doc) return { year: null, gutenbergId: null, listenable: false }
  const gutenbergId = doc.id_project_gutenberg?.length
    ? Number(doc.id_project_gutenberg[0])
    : null
  const listenable =
    doc.ebook_access === "public" &&
    gutenbergId !== null &&
    Number.isFinite(gutenbergId)
  return {
    year: doc.first_publish_year ?? null,
    gutenbergId: listenable ? gutenbergId : null,
    listenable,
  }
}

/** Fetches a short description (and an ISBN fallback) from Google Books. */
async function googleBooksMeta(
  title: string,
  author: string,
  isbn: string | null,
): Promise<{ description: string; isbn: string | null }> {
  const q = isbn
    ? `isbn:${isbn}`
    : `intitle:${title}${author && author !== "Unknown" ? `+inauthor:${author}` : ""}`
  const data = await timedJson<{
    items?: {
      volumeInfo?: {
        description?: string
        industryIdentifiers?: { type?: string; identifier?: string }[]
      }
    }[]
  }>(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=3&country=US`,
  )
  for (const item of data?.items ?? []) {
    const info = item.volumeInfo
    if (!info) continue
    const description = (info.description || "").trim()
    const foundIsbn =
      info.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier ||
      info.industryIdentifiers?.find((i) => i.type === "ISBN_10")?.identifier ||
      null
    if (description) {
      return { description: description.slice(0, 1200), isbn: isbn || foundIsbn }
    }
    if (foundIsbn && !isbn) return { description: "", isbn: foundIsbn }
  }
  return { description: "", isbn }
}

/** Finds an existing catalog row by ISBN, then by normalized title + author. */
async function findCatalogMatch(title: string, author: string, isbn: string | null) {
  const cleanIsbn = (isbn || "").replace(/[^0-9Xx]/g, "")
  if (cleanIsbn) {
    const [byIsbn] = await db
      .select()
      .from(book)
      .where(eq(book.isbn, cleanIsbn))
      .limit(1)
    if (byIsbn) return byIsbn
  }
  const key = dedupeKey(title, author)
  const titleMatches = await db
    .select()
    .from(book)
    .where(sql`lower(${book.title}) = lower(${title})`)
    .limit(20)
  return titleMatches.find((m) => dedupeKey(m.title, m.author) === key) ?? null
}

/**
 * Recognizes a book from a captured cover photo and resolves the best metadata
 * we can, WITHOUT writing anything. Signed-in only; a scan draws from the same
 * free-tier AI quota as the other content tools (subscribers are unlimited).
 */
export async function recognizeBookCover(dataUrl: string): Promise<ScanResult> {
  const user = await getCurrentUser()
  if (!user) return { error: "Please sign in to scan book covers." }

  const identified = await identifyBookFromCover(dataUrl)
  if (identified.error) return { error: identified.error }

  const title = normalizeTitle(identified.title)
  const author = normalizeAuthor(identified.author)
  if (!title) {
    return {
      error:
        "We couldn't read the title from that photo. Try again with the cover " +
        "filling the frame in good light.",
    }
  }
  let isbn = identified.isbn

  // 1. Already in our catalog? Reuse the real row so actions are instant and
  //    no duplicate is ever created.
  const existing = await findCatalogMatch(title, author, isbn)
  if (existing) {
    const fulfillment = existing.fulfillment === "affiliate" ? "affiliate" : "in_app"
    const amazonFormats = await affiliateFormatsForBook({
      title: existing.title,
      author: existing.author,
      isbn: existing.isbn,
      buyUrl: existing.buyUrl,
      kindleAsin: existing.kindleAsin,
      audibleAsin: existing.audibleAsin,
      printAsin: existing.printAsin,
    })
    return {
      match: {
        inCatalog: true,
        bookId: existing.id,
        title: existing.title,
        author: existing.author,
        isbn: existing.isbn,
        year: existing.publicationYear ?? null,
        coverUrl: existing.coverImageUrl,
        description: existing.description,
        listenable: fulfillment === "in_app" && existing.gutenbergId != null,
        gutenbergId: existing.gutenbergId ?? null,
        fulfillment,
        confidence: identified.confidence,
        amazonFormats,
      },
    }
  }

  // 2. New to us: enrich from public sources (never write a row here).
  const [ol, gb, cover] = await Promise.all([
    openLibraryMeta(title, author),
    googleBooksMeta(title, author, isbn),
    resolveRealCover({ title, author, isbn }),
  ])
  isbn = isbn || gb.isbn
  const description =
    gb.description || `${title} by ${author}.`
  const fulfillment: "in_app" | "affiliate" = ol.listenable ? "in_app" : "affiliate"
  const amazonFormats = await affiliateFormatsForBook({ title, author, isbn })

  return {
    match: {
      inCatalog: false,
      bookId: null,
      title,
      author,
      isbn,
      year: ol.year,
      coverUrl: cover,
      description,
      listenable: ol.listenable,
      gutenbergId: ol.gutenbergId,
      fulfillment,
      confidence: identified.confidence,
      amazonFormats,
    },
  }
}

/**
 * Find-or-create the real catalog row for a scanned book, on demand. Called the
 * first time the user takes an action that needs a persistent book (view
 * details, wishlist, add to library, or shop). Public-domain titles import the
 * full Gutenberg text; commercial titles create a lightweight affiliate row
 * that stays out of the public store (published=false) but powers the detail
 * page, wishlist, and affiliate attribution. Idempotent.
 */
export async function ensureScannedBook(
  input: EnsureBookInput,
): Promise<{ bookId: number } | { error: string }> {
  const user = await getCurrentUser()
  if (!user) return { error: "Please sign in to continue." }

  // Already a real catalog row.
  if (input.bookId) return { bookId: input.bookId }

  const title = normalizeTitle(input.title)
  const author = normalizeAuthor(input.author)
  if (!title) return { error: "Missing book details. Please scan again." }

  // Public-domain: import the full text (dedupes by gutenberg id internally).
  if (input.listenable && input.gutenbergId) {
    const id = await importGutenbergBook(input.gutenbergId, { title, author })
    if (id) return { bookId: id }
    // Fall through to an affiliate row if the text couldn't be loaded.
  }

  // Reuse an existing row if one already matches (avoid duplicates).
  const existing = await findCatalogMatch(title, author, input.isbn)
  if (existing) return { bookId: existing.id }

  const isbn = (input.isbn || "").replace(/[^0-9Xx]/g, "") || null
  const description = input.description?.trim() || `${title} by ${author}.`
  const [inserted] = await db
    .insert(book)
    .values({
      title,
      author,
      category: "General",
      language: "en",
      description,
      excerpt: description.slice(0, 400),
      content: "",
      fulfillment: "affiliate",
      priceInCents: 0,
      isbn,
      coverImageUrl: input.coverUrl || null,
      publicationYear: input.year ?? null,
      // Scanned commercial rows stay out of the public storefront but still
      // power the detail page, wishlist, and affiliate reporting.
      published: false,
      availability: "affiliate_only",
    })
    .returning({ id: book.id })

  if (!inserted) return { error: "Could not save this book. Please try again." }
  return { bookId: inserted.id }
}
