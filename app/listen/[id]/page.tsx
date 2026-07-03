import { redirect } from "next/navigation"

// Legacy route — listening now happens under /app/listen/[id].
export default async function LegacyListenRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/app/listen/${id}`)
}
