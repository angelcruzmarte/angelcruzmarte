"use client"

import Link from "next/link"
import { FileText, Play } from "lucide-react"
import { DocumentThumbnail } from "@/components/document-thumbnail"

export type ContinueDoc = {
  id: number
  title: string
  content: string
  wordCount: number
  /** Blob URL of the original uploaded file (PDF/image), if preserved. */
  originalUrl?: string | null
  /** MIME type of the original file. */
  originalMime?: string | null
  /** Persisted first-page thumbnail URL, if generated. */
  thumbnailUrl?: string | null
}

/**
 * Returns a renderable first-page preview source for a document, or null when
 * there's nothing visual to show (pasted/typed text or a link).
 */
function docPreview(
  doc: ContinueDoc,
): { src: string; mime: string; thumbnailUrl?: string | null } | null {
  if (doc.thumbnailUrl) {
    return {
      src: doc.originalUrl ?? doc.thumbnailUrl,
      mime: (doc.originalMime ?? "image/jpeg").toLowerCase(),
      thumbnailUrl: doc.thumbnailUrl,
    }
  }
  if (!doc.originalUrl) return null
  const mime = (doc.originalMime ?? "").toLowerCase()
  if (mime.startsWith("image/") || mime.includes("pdf")) {
    return { src: doc.originalUrl, mime, thumbnailUrl: null }
  }
  return null
}

export function ContinueListening({ docs }: { docs: ContinueDoc[] }) {
  // Each row simply opens the full premium player for that document. We no
  // longer start an inline (device-voice) player here — that produced robotic
  // audio and a second floating bar that duplicated this list.
  return (
    <div className="space-y-2">
      {docs.map((doc) => {
        const preview = docPreview(doc)
        const iconFallback = (
          <span className="absolute inset-0 flex items-center justify-center bg-secondary text-muted-foreground">
            <FileText className="h-5 w-5" />
          </span>
        )
        return (
          <Link
            key={doc.id}
            href={`/app/listen/${doc.id}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
          >
            <span className="relative flex h-12 w-10 shrink-0 overflow-hidden rounded-lg border border-border">
              {preview ? (
                <DocumentThumbnail
                  src={preview.src}
                  mime={preview.mime}
                  thumbnailUrl={preview.thumbnailUrl}
                  docId={doc.id}
                  fallback={iconFallback}
                />
              ) : (
                iconFallback
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{doc.title}</span>
              <span className="block text-xs text-muted-foreground">
                {doc.wordCount} words
              </span>
            </span>
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <Play className="h-4 w-4 translate-x-0.5" />
            </span>
          </Link>
        )
      })}
    </div>
  )
}
