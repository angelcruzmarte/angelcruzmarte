import Link from "next/link"
import {
  BookOpen,
  CircleDollarSign,
  FileText,
  Filter,
  Library,
  Repeat,
  ShoppingBag,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react"
import { getAdminStats, getFinanceData } from "@/app/actions/admin"
import { getFunnelData } from "@/app/actions/funnel"
import { getActivePromotion } from "@/app/actions/promotions"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

export default async function AdminOverviewPage() {
  const [stats, finance, funnel, promo] = await Promise.all([
    getAdminStats(),
    getFinanceData(),
    getFunnelData(),
    getActivePromotion(),
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
          href="/finance"
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          <CircleDollarSign className="h-4 w-4" />
          View full financials
        </Link>
      </div>

      {/* Growth: pricing funnel + active promotion */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Pricing funnel</span>
            </div>
            <Link
              href="/funnel"
              className="text-xs font-medium text-primary hover:underline"
            >
              View details
            </Link>
          </div>
          <div className="mt-4 flex items-end gap-6">
            <div>
              <p className="text-3xl font-semibold tabular-nums tracking-tight">
                {funnel.conversionRate.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">
                visitor → registration
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  {funnel.visitors.toLocaleString()}
                </span>{" "}
                viewed pricing
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {funnel.unconverted.toLocaleString()}
                </span>{" "}
                didn&apos;t register
              </p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, Math.max(2, funnel.conversionRate))}%`,
              }}
            />
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Active promotion</span>
          </div>
          {promo ? (
            <div className="mt-4 flex flex-1 flex-col">
              <div className="flex items-center gap-2">
                <p className="text-2xl font-semibold tracking-tight">
                  {promo.percentOff}% off
                </p>
                <Badge variant="default">Live</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{promo.name}</p>
              <Link
                href="/promotions"
                className={
                  buttonVariants({ variant: "secondary", size: "sm" }) +
                  " mt-auto w-fit"
                }
              >
                Manage promotions
              </Link>
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col">
              <p className="text-sm text-muted-foreground">
                No promotion is currently running.
              </p>
              <Link
                href="/promotions"
                className={
                  buttonVariants({ size: "sm" }) + " mt-auto w-fit"
                }
              >
                Create a promotion
              </Link>
            </div>
          )}
        </Card>
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
          <Link href="/finance" className={buttonVariants() + " mt-4"}>
            View finance
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Run a promotion</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Offer a discount that applies automatically at checkout and shows
            during signup.
          </p>
          <Link
            href="/promotions"
            className={buttonVariants({ variant: "secondary" }) + " mt-4"}
          >
            Manage promotions
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="font-semibold">Manage users</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review accounts, billing history, renewal dates, and admin access.
          </p>
          <Link
            href="/users"
            className={buttonVariants({ variant: "secondary" }) + " mt-4"}
          >
            View users
          </Link>
        </Card>
      </div>
    </div>
  )
}
