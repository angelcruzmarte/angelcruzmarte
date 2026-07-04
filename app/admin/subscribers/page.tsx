import { getSubscribers } from "@/app/actions/admin"
import { getCurrentUser } from "@/lib/session"
import { AdminSubscribersTable } from "@/components/admin-subscribers-table"

export default async function AdminSubscribersPage() {
  const [subscribers, user] = await Promise.all([
    getSubscribers(),
    getCurrentUser(),
  ])

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Subscribers</h1>
      <p className="mt-1 text-muted-foreground">
        Everyone who has signed up. Use the tabs to separate paying subscribers
        from free users.
      </p>
      <div className="mt-8">
        <AdminSubscribersTable
          subscribers={subscribers}
          currentUserId={user!.id}
        />
      </div>
    </div>
  )
}
