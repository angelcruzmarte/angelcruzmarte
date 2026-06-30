import Link from "next/link"
import { redirect } from "next/navigation"
import { Lock } from "lucide-react"
import { getReadingItem } from "@/app/actions/library"
import { getCurrentUser } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ListenPlayer } from "@/components/listen-player"

export default async function ListenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const { id } = await params
  const numericId = Number(id)
  if (Number.isNaN(numericId)) redirect("/library")

  const result = await getReadingItem(numericId)

  if ("error" in result && result.error) {
    const needsSubscription = result.error.includes("subscription")
    return (
      <div className="min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-md px-4 py-20 sm:px-6">
          <Card className="p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">{result.error}</h1>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/library" className={buttonVariants({ variant: "secondary" })}>
                Back to library
              </Link>
              {needsSubscription && (
                <Link href="/subscribe" className={buttonVariants()}>
                  Subscribe
                </Link>
              )}
            </div>
          </Card>
        </main>
      </div>
    )
  }

  const { item } = result

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <ListenPlayer
        title={item.title}
        author={item.author}
        content={item.content}
      />
    </div>
  )
}
