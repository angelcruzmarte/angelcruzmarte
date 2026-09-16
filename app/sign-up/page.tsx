import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"
import { PricingViewTracker } from "@/components/pricing-view-tracker"
import { getActivePromotion } from "@/app/actions/promotions"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

// Auth page — kept out of search results.
export const metadata: Metadata = {
  title: "Create your account — VOXYFI",
  robots: { index: false, follow: false },
}

export default async function SignUpPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session?.user) redirect("/app")
  const promo = await getActivePromotion()
  return (
    <>
      <PricingViewTracker path="sign-up" />
      <AuthForm
        mode="sign-up"
        promo={
          promo && promo.showBanner
            ? {
                name: promo.name,
                percentOff: promo.percentOff,
                description: promo.description,
              }
            : null
        }
      />
    </>
  )
}
