import { redirect } from "next/navigation"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getLifetimeStats } from "@/app/actions/stats"
import { getOrCreateReferralCode } from "@/app/actions/profile"
import { ProfileView } from "@/components/profile-view"

export const metadata = {
  title: "Profile · VOXYFI",
  description: "Your VOXYFI profile, stats, and settings.",
}

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  const [lifetime, referralCode] = await Promise.all([
    getLifetimeStats(),
    getOrCreateReferralCode(),
  ])

  return (
    <ProfileView
      name={user.name}
      username={user.username}
      email={user.email}
      image={user.image}
      isAdmin={user.role === "admin"}
      isSubscribed={hasActiveSubscription(user)}
      planName={user.plan ?? undefined}
      lifetime={lifetime}
      referralCode={referralCode}
    />
  )
}
