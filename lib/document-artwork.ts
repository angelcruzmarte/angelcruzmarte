// Resolves high-quality artwork for a document to use as media/now-playing
// artwork (iPhone Lock Screen, Live Activities, Apple Watch Now Playing,
// notifications, and the OS media controls) via the Web MediaSession API, and
// provides the shared first-page render used for in-app thumbnails.
//
// Client-only: it renders PDFs with pdf.js and uses <canvas>, so it must only
// be imported/called in the browser.

import { loadPdfjs } from "@/lib/pdfjs"
import { saveDocumentThumbnail } from "@/app/actions/documents"

/** The VOXYFI logo raster, used as the universal fallback artwork. */
export const VOXYFI_ARTWORK = "/icon-512.png"

// Cache resolved artwork by source URL so we never re-render the same PDF page
// (or re-decide) each time playback metadata refreshes.
const artworkCache = new Map<string, string>()

/**
 * Renders the first page of a PDF to a crisp JPEG data URL at `width` px wide.
 * Fills white first so transparent regions don't come out black. Throws on
 * failure so callers can fall back.
 */
export async function renderPdfFirstPageToJpeg(
  src: string,
  width = 512,
): Promise<string> {
  const pdfjs = await loadPdfjs()
  const data = await fetch(src).then((r) => {
    if (!r.ok) throw new Error(`fetch ${r.status}`)
    return r.arrayBuffer()
  })
  const doc = await pdfjs.getDocument({ data }).promise
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const scale = width / base.width
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement("canvas")
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no 2d context")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL("image/jpeg", 0.85)
}

// Track which document ids we've already persisted (or are persisting) this
// session so multiple surfaces rendering the same doc never double-upload.
const persistInflight = new Map<number, Promise<string | null>>()

/**
 * Fire-and-forget: persists a generated thumbnail data URL to Blob for `docId`
 * so future loads and OS artwork use a real https URL. Deduped per id; never
 * throws (persistence is best-effort). Returns the stored URL when available.
 */
export function persistDocumentThumbnail(
  docId: number,
  dataUrl: string,
): Promise<string | null> {
  const existing = persistInflight.get(docId)
  if (existing) return existing
  const work = saveDocumentThumbnail(docId, dataUrl).catch(() => null)
  persistInflight.set(docId, work)
  return work
}

/** True for PDFs, detected by MIME type or file extension. */
function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name)
}

/**
 * Automatically generates and persists a branded first-page thumbnail for a
 * freshly uploaded PDF, so the document has a real preview (library grid + the
 * `/og` share card) immediately — without waiting for the first playback.
 *
 * Runs in the browser (pdf.js needs <canvas>) using the File the user just
 * uploaded, then persists to Blob via the existing dedup/idempotent path. It is
 * best-effort and bounded: if rendering a large/slow PDF exceeds `timeoutMs`,
 * it resolves so navigation is never blocked; the render + persist still finish
 * in the background (and the player also self-heals the thumbnail on load).
 * Never throws.
 */
export async function generateUploadThumbnail(
  docId: number,
  file: File,
  timeoutMs = 6000,
): Promise<string | null> {
  if (!isPdfFile(file)) return null
  const work = (async () => {
    let objectUrl: string | null = null
    try {
      objectUrl = URL.createObjectURL(file)
      const dataUrl = await renderPdfFirstPageToJpeg(objectUrl, 640)
      return await persistDocumentThumbnail(docId, dataUrl)
    } catch {
      return null
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  })()
  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), timeoutMs),
  )
  return Promise.race([work, timeout])
}

/**
 * Returns an artwork source usable in a MediaImage `src`:
 * - a persisted thumbnail URL (best — a real https URL iOS surfaces render),
 * - image documents → the image URL directly (already high quality),
 * - PDFs → the first page rendered to a crisp 512px JPEG data URL (and, when a
 *   `docId` is given, persisted so subsequent playback gets a real URL),
 * - anything else, or on failure → the VOXYFI logo.
 *
 * Never rejects — callers always get a usable artwork string.
 */
export async function resolveDocumentArtwork(opts: {
  originalUrl?: string | null
  originalMime?: string | null
  thumbnailUrl?: string | null
  docId?: number
}): Promise<string> {
  const { originalUrl, originalMime, thumbnailUrl, docId } = opts

  // A persisted thumbnail is always the best choice: a real, cached https URL.
  if (thumbnailUrl) return thumbnailUrl
  if (!originalUrl) return VOXYFI_ARTWORK

  const cached = artworkCache.get(originalUrl)
  if (cached) return cached

  const mime = (originalMime ?? "").toLowerCase()

  try {
    if (mime.startsWith("image/")) {
      // Image documents already have a real https URL — perfect as-is for OS
      // artwork; no rendering or persistence needed.
      artworkCache.set(originalUrl, originalUrl)
      return originalUrl
    }

    if (mime.includes("pdf") || /\.pdf(\?|$)/i.test(originalUrl)) {
      const out = await renderPdfFirstPageToJpeg(originalUrl, 512)
      artworkCache.set(originalUrl, out)
      if (docId) void persistDocumentThumbnail(docId, out)
      return out
    }
  } catch {
    // fall through to the logo
  }

  return VOXYFI_ARTWORK
}

/**
 * Builds a MediaImage[] artwork array (multiple sizes pointing at the same
 * high-res source) for MediaMetadata. Infers a MIME type when possible so the
 * OS can pick the image correctly.
 */
export function buildMediaArtwork(src: string): MediaImage[] {
  const type = src.startsWith("data:image/png") || /\.png(\?|$)/i.test(src)
    ? "image/png"
    : src.startsWith("data:image/jpeg") || /\.jpe?g(\?|$)/i.test(src)
      ? "image/jpeg"
      : undefined
  const sizes = ["96x96", "128x128", "192x192", "256x256", "384x384", "512x512"]
  return sizes.map((s) => ({
    src,
    sizes: s,
    ...(type ? { type } : {}),
  }))
}
