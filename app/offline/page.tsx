import type { Metadata } from "next"
import { LogoMark } from "@/components/logo-mark"

export const metadata: Metadata = {
  title: "Offline — VOXYFI",
  description: "You are currently offline.",
}

export default function OfflinePage() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <LogoMark className="h-8 w-8" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">
        You&apos;re offline
      </h1>
      <p className="max-w-sm text-pretty text-muted-foreground">
        VOXYFI needs an internet connection to stream narration and load your
        library. Reconnect and try again.
      </p>
    </main>
  )
}
