"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import {
  persistDocumentThumbnail,
  renderPdfFirstPageToJpeg,
} from "@/lib/document-artwork"
import { cn } from "@/lib/utils"

// Cache rendered first-page thumbnails (data URLs) by source URL so switching
// views (list <-> grid) or re-scrolling never re-renders the same PDF page.
const thumbCache = new Map<string, string>()

/**
 * Renders a visual preview of a document's first/main page to fill its parent
 * (which must be `relative` and sized). In priority order it uses: a persisted
 * thumbnail URL (instant, high quality), then an image document's URL directly,
 * then a client-side pdf.js render of a PDF's first page (lazy + cached). When
 * a PDF is rendered and `docId` is provided, the result is persisted to Blob so
 * later views and OS now-playing artwork can use a real URL. When nothing is
 * previewable or rendering fails, the caller's `fallback` is shown — so a
 * generic icon/badge is always the safety net, never a broken image.
 */
export function DocumentThumbnail({
  src,
  mime,
  fallback,
  badge,
  thumbnailUrl,
  docId,
}: {
  src: string
  mime: string
  fallback: React.ReactNode
  /** Optional overlay (e.g. a type chip) shown only when a preview renders. */
  badge?: React.ReactNode
  /** Persisted thumbnail URL; when present it's used directly (preferred). */
  thumbnailUrl?: string | null
  /** Document id — enables persisting a freshly rendered PDF thumbnail. */
  docId?: number
}) {
  const isImage = mime.startsWith("image/")
  const isPdf = mime.includes("pdf")
  // A directly displayable URL: a persisted thumbnail, or an image doc's URL.
  const directUrl = thumbnailUrl || (isImage ? src : null)

  const [url, setUrl] = useState<string | null>(
    () => directUrl ?? thumbCache.get(src) ?? null,
  )
  const [failed, setFailed] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (directUrl || !isPdf || url || failed) return
    const el = hostRef.current
    if (!el) return
    let cancelled = false

    async function renderFirstPage() {
      try {
        const out = await renderPdfFirstPageToJpeg(src, 512)
        if (cancelled) return
        thumbCache.set(src, out)
        setUrl(out)
        // Self-healing backfill: store it so future views + media artwork use a
        // real URL instead of re-rendering the PDF. Best-effort, deduped by id.
        if (docId != null) void persistDocumentThumbnail(docId, out)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    // Only render when the thumbnail scrolls near the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        void renderFirstPage()
      },
      { rootMargin: "800px 0px" },
    )
    io.observe(el)

    return () => {
      cancelled = true
      io.disconnect()
    }
  }, [src, isPdf, url, failed, directUrl, docId])

  // Not previewable, or rendering failed → show the caller's fallback.
  if ((!directUrl && !isPdf) || failed) {
    return <>{fallback}</>
  }

  return (
    <div ref={hostRef} className="absolute inset-0">
      {url ? (
        <>
          <img
            src={url || "/placeholder.svg"}
            alt=""
            className={cn("h-full w-full bg-white object-cover object-top")}
          />
          {badge}
        </>
      ) : (
        // PDF thumbnail still rendering.
        <div className="flex h-full w-full items-center justify-center bg-secondary">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  )
}
