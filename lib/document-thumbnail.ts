// Single, shared server-side thumbnail pipeline.
//
// Every import source — direct upload, Google Drive / OneDrive / Dropbox cloud
// imports, URL fetches, and local files — funnels through this one module so
// each document ends up with a consistent, high-quality cover image and the
// storage layout is identical everywhere. Rendering strategy by content:
//   • PDF   → rasterize page 1 with pdf.js + @napi-rs/canvas
//   • image → downscale the source image itself with sharp
//   • other → no raster source (caller keeps the branded logo fallback)
//
// The pipeline is idempotent (skips documents that already have a thumbnail),
// ownership-scoped, and fully best-effort: any failure returns null and never
// throws, so a missing cover can never block an import.
//
// Server-only: never import this into a client component.

import "server-only"

import { db } from "@/lib/db"
import { document } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { put } from "@vercel/blob"
import { renderPdfFirstPageToJpegBuffer } from "@/lib/pdf-thumbnail-server"

// Standard cover width (px). Portrait PDF pages and most images land ~640x905.
const THUMB_WIDTH = 640
// JPEG quality for the stored cover — small files, still crisp at grid sizes.
const THUMB_QUALITY = 82

export type ThumbnailInput = {
  /** Owner of the document (for the ownership-scoped DB update + blob path). */
  userId: string
  /** Document id to attach the thumbnail to. */
  docId: number
  /** Raw source bytes (the original PDF or image). */
  buffer: Buffer
  /** Original file name — used only to infer the format. */
  name?: string | null
  /** Explicit MIME type when known (from the picker / upload / response). */
  mimeType?: string | null
}

function isPdf(name: string, mime: string): boolean {
  return mime.includes("pdf") || /\.pdf$/i.test(name)
}

function isImage(name: string, mime: string): boolean {
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(name)
}

/**
 * Rasterizes the appropriate cover source to a JPEG buffer, or null when the
 * content has no visual first page (plain text, HTML, EPUB, etc.).
 */
async function renderCoverJpeg(
  buffer: Buffer,
  name: string,
  mime: string,
): Promise<Buffer | null> {
  if (isPdf(name, mime)) {
    return renderPdfFirstPageToJpegBuffer(buffer, THUMB_WIDTH)
  }
  if (isImage(name, mime)) {
    try {
      // sharp is dynamically imported so it stays out of the client graph and
      // is only loaded when an image cover is actually needed.
      const sharp = (await import("sharp")).default
      return await sharp(buffer)
        .rotate() // respect EXIF orientation
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: THUMB_QUALITY })
        .toBuffer()
    } catch (err) {
      console.log(
        "[v0] image cover render failed:",
        err instanceof Error ? err.message : String(err),
      )
      return null
    }
  }
  return null
}

/**
 * Generates and stores a cover thumbnail for a document from its source bytes.
 * Returns the stored https URL, or null when no cover could be produced.
 *
 * Idempotent: if the document already has a thumbnail, the existing URL is
 * returned and nothing is re-rendered or re-uploaded. Best-effort: never throws.
 */
export async function generateAndStoreDocumentThumbnail(
  input: ThumbnailInput,
): Promise<string | null> {
  const { userId, docId, buffer } = input
  const name = (input.name ?? "").trim()
  const mime = (input.mimeType ?? "").trim().toLowerCase()

  try {
    if (!buffer || buffer.byteLength === 0) return null

    // Idempotency + ownership check in one query.
    const [existing] = await db
      .select({ thumbnailUrl: document.thumbnailUrl })
      .from(document)
      .where(and(eq(document.id, docId), eq(document.userId, userId)))
      .limit(1)
    if (!existing) return null
    if (existing.thumbnailUrl) return existing.thumbnailUrl

    const jpeg = await renderCoverJpeg(buffer, name, mime)
    if (!jpeg || jpeg.byteLength === 0) return null

    const blob = await put(
      `documents/${userId}/thumbnails/${docId}-${Date.now()}.jpg`,
      jpeg,
      { access: "public", addRandomSuffix: true, contentType: "image/jpeg" },
    )

    await db
      .update(document)
      .set({ thumbnailUrl: blob.url, updatedAt: new Date() })
      .where(and(eq(document.id, docId), eq(document.userId, userId)))

    return blob.url
  } catch (err) {
    console.log(
      "[v0] document thumbnail pipeline skipped:",
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}
