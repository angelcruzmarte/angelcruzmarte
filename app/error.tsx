"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Route error boundary:", error)
  }, [error])

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-foreground">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Something went wrong
        </h1>
        <p className="max-w-sm text-pretty text-muted-foreground">
          We hit an unexpected error loading this page. Try again, or head back
          to the app.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/app" className={buttonVariants({ variant: "secondary" })}>
          Go to the app
        </Link>
      </div>
      {/* Temporary diagnostic: show the exact error so we can fix the real
          cause. Remove once resolved. */}
      <pre className="mt-2 max-w-sm overflow-auto rounded-md bg-destructive/10 p-3 text-left text-[11px] leading-snug text-destructive whitespace-pre-wrap">
        {error?.message || "no message"}
        {error?.digest ? `\n[digest ${error.digest}]` : ""}
        {error?.stack ? `\n\n${error.stack.split("\n").slice(0, 6).join("\n")}` : ""}
      </pre>
    </main>
  )
}
