"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { loadPdfjs } from "@/lib/pdfjs"
import { cn } from "@/lib/utils"

// Cache rendered first-page thumbnails (data URLs) by source URL so switching
// views (list <-> grid) or re-scrolling never re-renders the same PDF page.
const thumbCache = new Map<string, string>()

/**
 * Renders a visual preview of a document's first/main page to fill its parent
 * (which must be `relative` and sized). Images are shown directly; PDFs are
 * rendered client-side with pdf.js, lazily (only when near the viewport) and
 * cached. When the source isn't previewable or rendering fails, the caller's
 * `fallback` is shown instead — so a generic icon/badge is always the safety
 * net, never a broken image.
 */
export function DocumentThumbnail({
  src,
  mime,
  fallback,
  badge,
}: {
  src: string
  mime: string
  fallback: React.ReactNode
  /** Optional overlay (e.g. a type chip) shown only when a preview renders. */
  badge?: React.ReactNode
}) {
  const isImage = mime.startsWith("image/")
  const isPdf = mime.includes("pdf")
  const [url, setUrl] = useState<string | null>(() =>
    isImage ? src : (thumbCache.get(src) ?? null),
  )
  const [failed, setFailed] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPdf || url || failed) return
    const el = hostRef.current
    if (!el) return
    let cancelled = false

    async function renderFirstPage() {
      try {
        const pdfjs = await loadPdfjs()
        const data = await fetch(src).then((r) => {
          if (!r.ok) throw new Error(`fetch ${r.status}`)
          return r.arrayBuffer()
        })
        if (cancelled) return
        const doc = await pdfjs.getDocument({ data }).promise
        const page = await doc.getPage(1)
        const base = page.getViewport({ scale: 1 })
        // Render at a modest width — plenty for a crisp thumbnail, cheap to draw.
        const scale = 360 / base.width
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement("canvas")
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("no 2d context")
        await page.render({ canvasContext: ctx, viewport }).promise
        if (cancelled) return
        const out = canvas.toDataURL("image/jpeg", 0.8)
        thumbCache.set(src, out)
        setUrl(out)
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
  }, [src, isPdf, url, failed])

  // Not previewable, or rendering failed → show the caller's fallback.
  if ((!isImage && !isPdf) || failed) {
    return <>{fallback}</>
  }

  return (
    <div ref={hostRef} className="absolute inset-0">
      {url ? (
        <>
          <img
            src={url || "/placeholder.svg"}
            alt=""
            className={cn(
              "h-full w-full bg-white object-cover object-top",
            )}
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
