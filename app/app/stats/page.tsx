import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { StatsView } from "@/components/stats-view"

export const metadata = {
  title: "Statistics · VOXYFI",
  description: "Track your listening time and words listened over time.",
}

export default async function StatsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  return <StatsView />
}
