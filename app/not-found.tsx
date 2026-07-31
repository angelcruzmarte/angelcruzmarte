import Link from "next/link"
import { BookOpen, Compass } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground">
        <Compass className="h-7 w-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          This page wandered off
        </h1>
        <p className="max-w-sm text-pretty text-muted-foreground">
          We couldn&apos;t find the page you were looking for. It may have moved,
          or the link might be out of date.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/app" className={buttonVariants()}>
          Go to your library
        </Link>
        <Link
          href="/app/books"
          className={buttonVariants({ variant: "secondary" })}
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Browse the store
        </Link>
      </div>
    </main>
  )
}
