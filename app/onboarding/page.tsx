import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { getMyInterests } from "@/app/actions/interests"
import { OnboardingFlow } from "@/components/onboarding-flow"

// Authenticated onboarding flow — not for search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (user.onboardingComplete) redirect("/app")

  const interests = await getMyInterests()

  return <OnboardingFlow initialInterests={interests} />
}
