import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { SubscribePlans } from "@/components/subscribe-plans"

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (hasActiveSubscription(user)) redirect("/library")

  const { canceled } = await searchParams

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight">
            Unlock the full library
          </h1>
          <p className="mt-3 text-pretty text-lg text-muted-foreground">
            Subscribe to listen to every title with natural narration and
            word-by-word highlighting.
          </p>
        </div>

        {canceled && (
          <p className="mx-auto mt-6 max-w-md rounded-lg bg-secondary px-4 py-2.5 text-center text-sm text-secondary-foreground">
            Checkout canceled. You can subscribe whenever you&apos;re ready.
          </p>
        )}

        <div className="mt-10">
          <SubscribePlans />
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already subscribed?{" "}
          <Link href="/library" className="font-medium text-primary hover:underline">
            Go to your library
          </Link>
        </p>
      </main>
    </div>
  )
}
