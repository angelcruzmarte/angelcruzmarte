import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"
import { PricingViewTracker } from "@/components/pricing-view-tracker"
import { getActivePromotion } from "@/app/actions/promotions"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

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
