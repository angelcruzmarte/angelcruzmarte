import { getUsers } from "@/app/actions/admin"
import { AdminUsersTable } from "@/components/admin-users-table"

export default async function AdminUsersPage() {
  const users = await getUsers()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-1 text-muted-foreground">
        Every account, with plan, subscription status, signup and renewal
        dates. Select a user to view full billing history.
      </p>
      <div className="mt-8">
        <AdminUsersTable users={users} />
      </div>
    </div>
  )
}
