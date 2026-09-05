import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { getBlockedUsers } from "@/app/actions/moderation"
import { BlockedUsersView } from "@/components/blocked-users-view"

export const metadata = {
  title: "Blocked Users · VOXYFI",
}

export default async function BlockedUsersPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const users = await getBlockedUsers()
  return <BlockedUsersView users={users} />
}
