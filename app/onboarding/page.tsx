import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { getMyInterests } from "@/app/actions/interests"
import { OnboardingFlow } from "@/components/onboarding-flow"

export default async function OnboardingPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")
  if (user.onboardingComplete) redirect("/app")

  const interests = await getMyInterests()

  return <OnboardingFlow initialInterests={interests} />
}
