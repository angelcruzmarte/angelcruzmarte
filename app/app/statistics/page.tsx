import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { getListeningStats } from "@/app/actions/stats"
import { StatisticsView } from "@/components/statistics-view"

export const metadata = {
  title: "Statistics · VOXYFI",
  description: "Your listening time and words listened over time.",
}

export default async function StatisticsPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  // Preload the default (week) range on the server for an instant first paint.
  const initialWeek = await getListeningStats("week")

  return <StatisticsView initialWeek={initialWeek} />
}
