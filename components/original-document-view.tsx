"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

/**
 * Whether we can render the uploaded file as an "original document" surface.
 * Falls back to the URL's extension when the stored MIME type is missing so
 * older/edge-case uploads still get the real-page experience.
 */
export function isViewableOriginal(
  mime?: string | null,
  url?: string | null,
): boolean {
  if (mime && (mime === "application/pdf" || mime.startsWith("image/"))) {
    return true
  }
  if (url && /\.(pdf|png|jpe?g|webp|gif)(\?|$)/i.test(url)) return true
  return false
}

/**
 * Renders the original uploaded file (a real PDF or a scanned image) so the
 * reader can see the source pages exactly as they were, instead of only the
 * extracted text. PDFs render in a native iframe; images render inline.
 */
export function OriginalDocumentView({
  src,
  mime,
  title,
  immersive = false,
}: {
  src: string
  mime?: string | null
  title: string
  /** Fills the viewport as the primary reading surface (Speechify-style). */
  immersive?: boolean
}) {
  const [loaded, setLoaded] = useState(false)
  const isPdf = mime === "application/pdf" || /\.pdf(\?|$)/i.test(src)

  if (immersive) {
    return (
      <section
        className="mx-auto h-full max-w-3xl px-3 pt-3 sm:px-6"
        aria-label="Original document"
      >
        <div className="relative h-[calc(100dvh-11rem)] overflow-hidden rounded-2xl border border-border bg-muted/30">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {isPdf ? (
            <iframe
              src={`${src}#view=FitH`}
              title={`${title} — original document`}
              onLoad={() => setLoaded(true)}
              className="h-full w-full bg-white"
            />
          ) : (
            <div className="h-full overflow-auto bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src || "/placeholder.svg"}
                alt={`${title} — original scan`}
                onLoad={() => setLoaded(true)}
                className="mx-auto h-auto w-full max-w-2xl rounded-lg"
              />
            </div>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto mt-4 max-w-3xl px-4 sm:px-6" aria-label="Original document">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-muted/30">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {isPdf ? (
          <iframe
            src={`${src}#view=FitH`}
            title={`${title} — original document`}
            onLoad={() => setLoaded(true)}
            className="h-[72vh] w-full bg-white"
          />
        ) : (
          <div className="max-h-[72vh] overflow-auto bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src || "/placeholder.svg"}
              alt={`${title} — original scan`}
              onLoad={() => setLoaded(true)}
              className="mx-auto h-auto w-full max-w-2xl rounded-lg"
            />
          </div>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        Viewing the original document. Switch to Text to follow along with
        highlighting while you listen.
      </p>
    </section>
  )
}
