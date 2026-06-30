import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { AISummaryTool } from "@/components/ai-summary-tool"
import { PremiumGate } from "@/components/premium-gate"
import { buttonVariants } from "@/components/ui/button"

export default async function SummaryPage() {
  const user = await getCurrentUser()
  const subscribed = hasActiveSubscription(user)

  return (
    <div className="px-4 py-6 sm:px-6">
      <Link
        href="/app"
        className={buttonVariants({ variant: "ghost", size: "sm" }) + " mb-3 gap-1.5"}
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">AI Summary</h1>
      <p className="mb-6 text-muted-foreground">
        Condense any text into a clear summary and key takeaways.
      </p>
      {subscribed ? <AISummaryTool /> : <PremiumGate feature="AI Summary" />}
    </div>
  )
}
