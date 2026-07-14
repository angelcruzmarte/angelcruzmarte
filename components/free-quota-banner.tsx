import Link from "next/link"
import { Sparkles } from "lucide-react"
import { getAiQuotaStatus } from "@/app/actions/ai"
import { cn } from "@/lib/utils"

/** Human-friendly "in X" phrase for a refill countdown given minutes. */
function refillPhrase(minutes: number | null): string {
  if (!minutes) return ""
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60)
    return ` Another unlocks in about ${hours} hour${hours === 1 ? "" : "s"}.`
  }
  return ` Another unlocks in ${minutes} minute${minutes === 1 ? "" : "s"}.`
}

/**
 * Free-tier banner for the AI create tools. Shows how many banked AI
 * generations remain (a quarter of capacity refills every few hours) and links
 * to the subscribe page. Rendered only for non-subscribers (caller decides).
 */
export async function FreeQuotaBanner({ className }: { className?: string }) {
  const { available, capacity, nextRefillMinutes } = await getAiQuotaStatus()
  const none = available <= 0

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
            ? `You're out of free AI generations.${refillPhrase(nextRefillMinutes)}`
            : `${available} of ${capacity} free AI generations available.${refillPhrase(nextRefillMinutes)}`}
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
