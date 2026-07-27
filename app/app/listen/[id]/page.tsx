import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getDocument } from "@/app/actions/documents"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getTodayListenSeconds } from "@/app/actions/stats"
import { languageLabel } from "@/lib/languages"
import { ListenPlayer } from "@/components/listen-player"

// Allow time for on-demand translation of long documents.
export const maxDuration = 60

// Human-friendly label for a document's source type, used on the share card.
function kindLabel(sourceType: string | null | undefined, mime?: string | null): string {
  if (mime?.includes("pdf")) return "PDF"
  switch (sourceType) {
    case "link":
      return "Article"
    case "file":
      return "Document"
    case "text":
      return "Note"
    default:
      return "Document"
  }
}

// Byline for the share card: the source website's hostname for link/article
// docs (e.g. "nytimes.com"). Documents have no author field, so this is the
// most meaningful attribution available. Returns null for non-link sources.
function sourceByline(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl) return null
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

// Per-document branded share card via the dynamic /og generator.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const docId = Number(id)
  if (Number.isNaN(docId)) return {}
  // getDocument throws for unauthenticated requests (e.g. social crawlers) and
  // returns null for missing/other-user docs. Either way, fall back to generic
  // branding rather than breaking metadata generation.
  let doc: Awaited<ReturnType<typeof getDocument>> | null = null
  try {
    doc = await getDocument(docId)
  } catch {
    doc = null
  }
  if (!doc) {
    const fallback = new URL("/og", "https://www.voxyfi.com").toString()
    return {
      openGraph: { images: [{ url: fallback, width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", images: [fallback] },
    }
  }

  const og = new URL("/og", "https://www.voxyfi.com")
  og.searchParams.set("title", doc.title)
  og.searchParams.set("kind", kindLabel(doc.sourceType, doc.originalMime))
  if (doc.sourceLang) og.searchParams.set("lang", languageLabel(doc.sourceLang))
  if (doc.wordCount) og.searchParams.set("words", String(doc.wordCount))
  // Real first-page preview when we have one (renders the two-column card).
  if (doc.thumbnailUrl) og.searchParams.set("thumb", doc.thumbnailUrl)
  // Documents have no author field; use the source site as a byline for links.
  const byline = sourceByline(doc.sourceUrl)
  if (byline) og.searchParams.set("author", byline)
  // Absolute URL so social crawlers can always resolve it.
  const image = og.toString()

  const title = `${doc.title} — VOXYFI`
  const description = `Listen to "${doc.title}" with natural-sounding AI narration, word-by-word highlighting, and instant translation on VOXYFI.`

  return {
    title,
    description,
    openGraph: {
      type: "article",
      title,
      description,
      images: [{ url: image, width: 1200, height: 630, alt: doc.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  }
}

export default async function AppListenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const docId = Number(id)
  if (Number.isNaN(docId)) notFound()

  const [doc, user] = await Promise.all([getDocument(docId), getCurrentUser()])
  if (!doc) notFound()
  const premium = hasActiveSubscription(user)
  // Only free users are capped, so only they need today's listening total.
  const initialListenSeconds = premium ? 0 : await getTodayListenSeconds()

  return (
    <ListenPlayer
      title={doc.title}
      content={doc.content}
      backHref="/app/library"
      backLabel="Library"
      premium={premium}
      allowDownload={premium}
      documentId={doc.id}
      initialWord={doc.lastWord}
      originalUrl={doc.originalUrl}
      originalMime={doc.originalMime}
      thumbnailUrl={doc.thumbnailUrl}
      sourceType={doc.sourceType}
      sourceLang={doc.sourceLang}
      initialListenSeconds={initialListenSeconds}
    />
  )
}
