import Link from "next/link"
import {
  BookOpen,
  CircleDollarSign,
  FileText,
  Library,
  Repeat,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react"
import { getAdminStats, getFinanceData } from "@/app/actions/admin"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

export default async function AdminOverviewPage() {
  const [stats, finance] = await Promise.all([
    getAdminStats(),
    getFinanceData(),
  ])

  const money = [
    {
      label: "Monthly recurring revenue",
      value: dollars(finance.mrr),
      hint: `${finance.activePaying} active subscribers`,
      icon: Repeat,
    },
    {
      label: "Revenue this month",
      value: dollars(finance.revenueThisMonth),
      hint: `${dollars(finance.bookRevenueThisMonth)} from book sales`,
      icon: CircleDollarSign,
    },
    {
      label: "Annual run rate",
      value: dollars(finance.arr),
      hint: "MRR projected over 12 months",
      icon: TrendingUp,
    },
  ]

  const cards = [
    { label: "Total users", value: stats.totalUsers, icon: Users },
    {
      label: "Active subscribers",
      value: stats.activeSubscribers,
      icon: TrendingUp,
    },
    { label: "Book catalog", value: stats.totalBooks, icon: BookOpen },
    { label: "Book purchases", value: stats.totalPurchases, icon: ShoppingBag },
    { label: "User documents", value: stats.totalDocuments, icon: FileText },
    { label: "Published titles", value: stats.publishedItems, icon: Library },
  ]

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-1 text-muted-foreground">
        A snapshot of revenue, subscribers, and your library.
      </p>

      {/* Financial snapshot */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {money.map((m) => (
          <Card
            key={m.label}
            className="border-primary/20 bg-primary/5 p-5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{m.label}</span>
              <m.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {m.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
          </Card>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Link
          href="/admin/finance"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <CircleDollarSign className="h-4 w-4" />
          View full financials
        </Link>
      </div>

      {/* Operational stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {card.label}
              </span>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {card.value.toLocaleString()}
            </p>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card className="p-6">
          <h2 className="font-semibold">Finance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Track MRR, book sales, plan mix, and recent transactions.
          </p>
          <Link href="/admin/finance" className={buttonVariants() + " mt-4"}>
            View finance
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Add a new title</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Publish an article or chapter for your subscribers to listen to.
          </p>
          <Link
            href="/admin/content"
            className={buttonVariants({ variant: "secondary" }) + " mt-4"}
          >
            Manage content
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Manage subscribers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review subscription status and assign admin access.
          </p>
          <Link
            href="/admin/subscribers"
            className={buttonVariants({ variant: "secondary" }) + " mt-4"}
          >
            View subscribers
          </Link>
        </Card>
      </div>
    </div>
  )
}
