import {
  getRatingsOverview,
  queryModerationLog,
} from "@/app/actions/admin-moderation"
import { AdminBookRatings } from "@/components/admin-ratings"

export const dynamic = "force-dynamic"

export default async function AdminBookRatingsPage() {
  const [overview, log] = await Promise.all([
    getRatingsOverview(),
    queryModerationLog(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Book ratings</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Voxyfi collects a 1–5 star rating per book — never written reviews.
        Review real rating statistics, per-book averages and distribution, and
        remove any invalid rating records. Every removal is recorded in the
        audit trail below. Only admins can view this page.
      </p>
      <div className="mt-8">
        <AdminBookRatings overview={overview} log={log} />
      </div>
    </div>
  )
}
