import Link from "next/link"
import { Sparkles } from "lucide-react"
import { getAiGenerationsLeftToday } from "@/app/actions/ai"
import { FREE_DAILY_AI_GENERATIONS } from "@/lib/limits"
import { cn } from "@/lib/utils"

/**
 * Free-tier banner for the AI create tools. Shows how many of the daily free
 * AI generations remain and links to the subscribe page. Rendered only for
 * non-subscribers (the caller decides).
 */
export async function FreeQuotaBanner({ className }: { className?: string }) {
  const left = await getAiGenerationsLeftToday()
  const none = left <= 0

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm",
        className,
      )}
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          {none
            ? "You've used all your free AI generations today"
            : `${left} of ${FREE_DAILY_AI_GENERATIONS} free AI generations left today`}
        </p>
        <p className="mt-0.5 text-pretty text-muted-foreground">
          Subscribe for unlimited AI summaries, quizzes, and podcasts.{" "}
          <Link
            href="/subscribe"
            className="font-medium text-primary underline underline-offset-2"
          >
            Upgrade to Premium
          </Link>
        </p>
      </div>
    </div>
  )
}
