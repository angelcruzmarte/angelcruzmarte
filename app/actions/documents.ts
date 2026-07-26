"use server"

import { auth } from "@/lib/auth"
import { detectLanguage } from "@/app/actions/ai"
import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { and, desc, eq, isNull, isNotNull, inArray } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { put } from "@vercel/blob"

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new Error("Unauthorized")
  return session.user.id
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export async function getDocuments() {
  const userId = await getUserId()
  return db
    .select()
    .from(document)
    // Exclude soft-deleted (trashed) documents from the library.
    .where(and(eq(document.userId, userId), isNull(document.deletedAt)))
    .orderBy(desc(document.updatedAt))
}

export async function getDocument(id: number) {
  const userId = await getUserId()
  const [doc] = await db
    .select()
    .from(document)
    .where(
      and(
        eq(document.id, id),
        eq(document.userId, userId),
        isNull(document.deletedAt),
      ),
    )
    .limit(1)
  return doc ?? null
}

/**
 * Persists a client-generated first-page thumbnail (a small JPEG/PNG data URL)
 * to Blob storage and stores its https URL on the document. Idempotent: if a
 * thumbnail already exists, the existing URL is returned and nothing is written.
 *
 * This is a self-healing backfill — the first surface (a library preview or the
 * player resolving now-playing artwork) that renders a document's page persists
 * it, so every later view and the OS media artwork can use a real URL instead
 * of re-rendering the PDF or relying on a data: URL that iOS won't display.
 */
export async function saveDocumentThumbnail(id: number, dataUrl: string) {
  const userId = await getUserId()

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl,
  )
  if (!match) throw new Error("Invalid thumbnail data")
  const [, mime, base64] = match
  const buffer = Buffer.from(base64, "base64")
  // Thumbnails are tiny; reject anything suspiciously large.
  if (buffer.byteLength === 0 || buffer.byteLength > 2 * 1024 * 1024) {
    throw new Error("Thumbnail out of size bounds")
  }

  // Ownership check + skip when one already exists (idempotent).
  const [doc] = await db
    .select({ thumbnailUrl: document.thumbnailUrl })
    .from(document)
    .where(and(eq(document.id, id), eq(document.userId, userId)))
    .limit(1)
  if (!doc) throw new Error("Not found")
  if (doc.thumbnailUrl) return doc.thumbnailUrl

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"
  const blob = await put(
    `documents/${userId}/thumbnails/${id}-${Date.now()}.${ext}`,
    buffer,
    { access: "public", addRandomSuffix: true, contentType: mime },
  )

  await db
    .update(document)
    .set({ thumbnailUrl: blob.url, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.userId, userId)))

  revalidatePath("/app/library")
  revalidatePath("/app")
  return blob.url
}

export async function createDocument(input: {
  title: string
  content: string
  sourceType?: string
  sourceUrl?: string
  originalUrl?: string | null
  originalMime?: string | null
  sourceLang?: string | null
}) {
  const userId = await getUserId()
  const title = input.title.trim() || "Untitled"
  const content = input.content.trim()
  if (!content) throw new Error("Content is required")

  // Detect the document language (for automatic translation on playback) when
  // the caller didn't already provide it, e.g. pasted text and imported links.
  let sourceLang = input.sourceLang ?? null
  if (!sourceLang) {
    try {
      sourceLang = await detectLanguage(content)
    } catch {
      sourceLang = null
    }
  }

  const [doc] = await db
    .insert(document)
    .values({
      userId,
      title,
      content,
      sourceType: input.sourceType ?? "text",
      sourceUrl: input.sourceUrl ?? null,
      originalUrl: input.originalUrl ?? null,
      originalMime: input.originalMime ?? null,
      sourceLang,
      wordCount: countWords(content),
    })
    .returning()

  revalidatePath("/app/library")
  return doc
}

/**
 * Fetches a URL and extracts readable text (title + body) so it can be
 * turned into a listening document. Best-effort HTML stripping.
 */
export async function importFromUrl(rawUrl: string) {
  await getUserId()
  let url: URL
  try {
    url = new URL(rawUrl.trim())
    if (!/^https?:$/.test(url.protocol)) throw new Error("bad protocol")
  } catch {
    throw new Error("Please enter a valid http(s) URL.")
  }

  let html = ""
  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VoxifyBot/1.0)" },
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    html = await res.text()
  } catch {
    throw new Error("Could not fetch that page. Try pasting the text instead.")
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch
    ? decodeEntities(titleMatch[1]).trim().slice(0, 200)
    : url.hostname

  const text = htmlToText(html)
  if (countWords(text) < 20) {
    throw new Error(
      "Couldn't extract enough readable text from that link. Try pasting the text instead.",
    )
  }

  return createDocument({
    title,
    content: text,
    sourceType: "link",
    sourceUrl: url.toString(),
  })
}

function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
}

function htmlToText(html: string) {
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html
  return decodeEntities(
    body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|br|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export async function updateProgress(id: number, lastWord: number) {
  const userId = await getUserId()
  await db
    .update(document)
    .set({ lastWord, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.userId, userId)))
}

/**
 * Moves a document to the trash (soft delete). It is hidden from the library
 * but can be restored from the "Deleted Files" screen.
 */
export async function deleteDocument(id: number) {
  const userId = await getUserId()
  await db
    .update(document)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.userId, userId)))
  revalidatePath("/app/library")
  revalidatePath("/app/books")
  revalidatePath("/app")
  revalidatePath("/app/profile/deleted")
}

/**
 * Moves multiple documents to the trash at once (soft delete). Used by the
 * library's "Select Multiple" bulk action.
 */
export async function deleteDocuments(ids: number[]) {
  if (ids.length === 0) return
  const userId = await getUserId()
  await db
    .update(document)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(document.userId, userId), inArray(document.id, ids)))
  revalidatePath("/app/library")
  revalidatePath("/app/books")
  revalidatePath("/app")
  revalidatePath("/app/profile/deleted")
}

/** Lists the user's trashed documents, most recently deleted first. */
export async function getDeletedDocuments() {
  const userId = await getUserId()
  return db
    .select()
    .from(document)
    .where(and(eq(document.userId, userId), isNotNull(document.deletedAt)))
    .orderBy(desc(document.deletedAt))
}

/** Restores a trashed document back into the library. */
export async function restoreDocument(id: number) {
  const userId = await getUserId()
  await db
    .update(document)
    .set({ deletedAt: null, updatedAt: new Date() })
    .where(and(eq(document.id, id), eq(document.userId, userId)))
  revalidatePath("/app/library")
  revalidatePath("/app/books")
  revalidatePath("/app")
  revalidatePath("/app/profile/deleted")
}

/** Permanently removes a single trashed document. Cannot be undone. */
export async function permanentlyDeleteDocument(id: number) {
  const userId = await getUserId()
  await db
    .delete(document)
    .where(
      and(
        eq(document.id, id),
        eq(document.userId, userId),
        isNotNull(document.deletedAt),
      ),
    )
  revalidatePath("/app/profile/deleted")
}

/** Empties the trash: permanently deletes every trashed document. */
export async function emptyTrash() {
  const userId = await getUserId()
  await db
    .delete(document)
    .where(and(eq(document.userId, userId), isNotNull(document.deletedAt)))
  revalidatePath("/app/profile/deleted")
}
