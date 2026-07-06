"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

/** MIME types we can render as an "original document" surface. */
export function isViewableOriginal(mime?: string | null): boolean {
  if (!mime) return false
  return mime === "application/pdf" || mime.startsWith("image/")
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
}: {
  src: string
  mime?: string | null
  title: string
}) {
  const [loaded, setLoaded] = useState(false)
  const isPdf = mime === "application/pdf" || /\.pdf(\?|$)/i.test(src)

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
