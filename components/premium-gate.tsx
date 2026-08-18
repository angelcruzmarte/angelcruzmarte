"use client"

import Link from "next/link"
import { Lock } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import { usePlatform } from "@/hooks/use-platform"

export function PremiumGate({ feature }: { feature: string }) {
  const { isIOS } = usePlatform()

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Lock className="h-6 w-6" />
      </span>
      <div>
        <h2 className="text-xl font-semibold">{feature} is a premium feature</h2>
        <p className="mx-auto mt-1 max-w-sm text-pretty text-muted-foreground">
          {isIOS
            ? "This feature is included with VOXYFI Premium. If you already have Premium, it's active on this account."
            : "Subscribe to unlock AI summaries, quizzes, podcasts, and the full VOXYFI library."}
        </p>
      </div>
      {/* Apple Guideline 3.1.1: no link to an external purchase flow on iOS. */}
      {!isIOS && (
        <Link href="/subscribe" className={buttonVariants({ size: "lg" })}>
          View plans
        </Link>
      )}
    </div>
  )
}
