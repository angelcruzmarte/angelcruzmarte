import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { AIPodcastTool } from "@/components/ai-podcast-tool"
import { PremiumGate } from "@/components/premium-gate"
import { buttonVariants } from "@/components/ui/button"

export default async function PodcastPage() {
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
      <h1 className="mb-1 text-3xl font-bold tracking-tight">AI Podcast</h1>
      <p className="mb-6 text-muted-foreground">
        Turn any text into a lively two-host podcast you can play aloud.
      </p>
      {subscribed ? <AIPodcastTool /> : <PremiumGate feature="AI Podcast" />}
    </div>
  )
}
