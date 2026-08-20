import { listPromotions } from "@/app/actions/promotions"
import { AdminPromotions } from "@/components/admin-promotions"

export default async function AdminPromotionsPage() {
  const promotions = await listPromotions()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Promotions</h1>
      <p className="mt-1 text-muted-foreground">
        Create discounts that apply automatically at checkout as real Stripe
        coupons. Active promotions can be surfaced during signup.
      </p>
      <div className="mt-8">
        <AdminPromotions promotions={promotions} />
      </div>
    </div>
  )
}
