import { getFinanceData } from "@/app/actions/admin"
import { AdminFinance } from "@/components/admin-finance"

export default async function AdminFinancePage() {
  const data = await getFinanceData()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
      <p className="mt-1 text-muted-foreground">
        Recurring revenue, book sales, and subscription performance.
      </p>
      <div className="mt-8">
        <AdminFinance data={data} />
      </div>
    </div>
  )
}
