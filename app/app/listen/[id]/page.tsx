import { notFound } from "next/navigation"
import { getDocument } from "@/app/actions/documents"
import { ListenPlayer } from "@/components/listen-player"

export default async function AppListenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const docId = Number(id)
  if (Number.isNaN(docId)) notFound()

  const doc = await getDocument(docId)
  if (!doc) notFound()

  return (
    <ListenPlayer
      title={doc.title}
      content={doc.content}
      backHref="/app/library"
      backLabel="Library"
    />
  )
}
