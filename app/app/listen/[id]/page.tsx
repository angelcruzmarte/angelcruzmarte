import { notFound } from "next/navigation"
import { getDocument } from "@/app/actions/documents"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getTodayListenSeconds } from "@/app/actions/stats"
import { ListenPlayer } from "@/components/listen-player"

// Allow time for on-demand translation of long documents.
export const maxDuration = 60

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
