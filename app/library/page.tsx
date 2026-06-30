import Link from "next/link"
import { redirect } from "next/navigation"
import { BookOpen, Lock, Sparkles } from "lucide-react"
import { getPublishedItems } from "@/app/actions/library"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { SiteHeader } from "@/components/site-header"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const subscribed = hasActiveSubscription(user)
  const items = await getPublishedItems()
  const { welcome } = await searchParams

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {welcome && subscribed && (
          <div className="mb-6 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
            <Sparkles className="h-4 w-4" />
            Welcome to Premium! Your full library is unlocked.
          </div>
        )}

        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
            <p className="mt-1 text-muted-foreground">
              {subscribed
                ? "Pick something to listen to."
                : "Subscribe to listen to any title."}
            </p>
          </div>
          {!subscribed && (
            <Link href="/subscribe" className={buttonVariants()}>
              Subscribe
            </Link>
          )}
        </div>

        {!subscribed && (
          <Card className="mt-6 flex items-center gap-4 border-primary/30 bg-primary/5 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">Listening is a Premium feature</p>
              <p className="text-sm text-muted-foreground">
                You can browse the catalog below. Subscribe to start listening.
              </p>
            </div>
            <Link href="/subscribe" className={buttonVariants({ size: "sm" })}>
              View plans
            </Link>
          </Card>
        )}

        {items.length === 0 ? (
          <Card className="mt-8 p-12 text-center">
            <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-medium">No titles yet</p>
            <p className="text-sm text-muted-foreground">
              Check back soon — new titles are added regularly.
            </p>
          </Card>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const card = (
                <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-md">
                  <Badge variant="secondary" className="w-fit">
                    {item.category}
                  </Badge>
                  <h2 className="mt-3 text-balance font-serif text-xl font-semibold leading-snug">
                    {item.title}
                  </h2>
                  {item.author && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      by {item.author}
                    </p>
                  )}
                  {item.excerpt && (
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                      {item.excerpt}
                    </p>
                  )}
                  <div className="mt-4 flex items-center gap-1.5 pt-1 text-sm font-medium text-primary">
                    {subscribed ? (
                      <>
                        <BookOpen className="h-4 w-4" />
                        Listen now
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Subscribe to listen
                      </>
                    )}
                  </div>
                </Card>
              )
              return subscribed ? (
                <Link key={item.id} href={`/listen/${item.id}`}>
                  {card}
                </Link>
              ) : (
                <Link key={item.id} href="/subscribe">
                  {card}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
