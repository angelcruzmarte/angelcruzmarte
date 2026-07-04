"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  BookOpen,
  CircleDollarSign,
  Gift,
  Repeat,
  TrendingUp,
  Users,
} from "lucide-react"
import type { FinanceData } from "@/app/actions/admin"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
}

function dollarsPrecise(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function AdminFinance({ data }: { data: FinanceData }) {
  const kpis = [
    {
      label: "Monthly recurring revenue",
      value: dollars(data.mrr),
      hint: `${data.activePaying} active · ${data.trialing} trialing`,
      icon: Repeat,
    },
    {
      label: "Annual run rate",
      value: dollars(data.arr),
      hint: "MRR projected over 12 months",
      icon: TrendingUp,
    },
    {
      label: "Revenue this month",
      value: dollars(data.revenueThisMonth),
      hint: `${dollars(data.bookRevenueThisMonth)} from book sales`,
      icon: CircleDollarSign,
    },
    {
      label: "Book sales (all time)",
      value: dollars(data.bookRevenueAllTime),
      hint: `${data.bookUnitsAllTime.toLocaleString()} paid ${
        data.bookUnitsAllTime === 1 ? "purchase" : "purchases"
      }`,
      icon: BookOpen,
    },
    {
      label: "Paying ARPU",
      value: dollarsPrecise(data.arpu),
      hint: "Avg. monthly revenue per paying user",
      icon: Users,
    },
    {
      label: "Free library adds",
      value: data.freeAdds.toLocaleString(),
      hint: "Public-domain titles added free",
      icon: Gift,
    },
  ]

  const totalPlans = data.planBreakdown.monthly + data.planBreakdown.yearly
  const monthlyPct = totalPlans
    ? Math.round((data.planBreakdown.monthly / totalPlans) * 100)
    : 0
  const yearlyPct = totalPlans ? 100 - monthlyPct : 0

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {kpi.label}
              </span>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {kpi.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>
          </Card>
        ))}
      </div>

      {/* Revenue trend */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Revenue trend</h2>
            <p className="text-sm text-muted-foreground">
              New subscription revenue and book sales over the last 12 months.
            </p>
          </div>
          <Badge variant="secondary">USD</Badge>
        </div>
        <ChartContainer
          config={{
            subscriptions: {
              label: "Subscriptions",
              color: "var(--chart-1)",
            },
            books: {
              label: "Book sales",
              color: "var(--chart-3)",
            },
          }}
          className="mt-6 h-[300px] w-full"
        >
          <BarChart data={data.trend} margin={{ left: 4, right: 4, top: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `$${v}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => [
                    `$${Number(value).toLocaleString()}`,
                    name === "subscriptions" ? "Subscriptions" : "Book sales",
                  ]}
                />
              }
            />
            <Bar
              dataKey="subscriptions"
              stackId="rev"
              fill="var(--color-subscriptions)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="books"
              stackId="rev"
              fill="var(--color-books)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        <div className="mt-4 flex items-center gap-5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--chart-1)" }}
            />
            Subscriptions
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: "var(--chart-3)" }}
            />
            Book sales
          </span>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Plan mix */}
        <Card className="p-6">
          <h2 className="font-semibold">Plan mix</h2>
          <p className="text-sm text-muted-foreground">
            How active subscribers are distributed across plans.
          </p>

          <div className="mt-6 space-y-5">
            <PlanBar
              name="Monthly"
              count={data.planBreakdown.monthly}
              pct={monthlyPct}
              color="var(--chart-1)"
            />
            <PlanBar
              name="Annual"
              count={data.planBreakdown.yearly}
              pct={yearlyPct}
              color="var(--chart-2)"
            />
          </div>

          <div className="mt-6 border-t border-border pt-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Active subscribers</span>
              <span className="font-medium tabular-nums">
                {data.activePaying.toLocaleString()}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">On free trial</span>
              <span className="font-medium tabular-nums">
                {data.trialing.toLocaleString()}
              </span>
            </div>
          </div>
        </Card>

        {/* Recent sales */}
        <Card className="p-6">
          <h2 className="font-semibold">Recent book sales</h2>
          <p className="text-sm text-muted-foreground">
            Latest one-time purchases from the store.
          </p>

          {data.recentSales.length === 0 ? (
            <p className="mt-6 rounded-lg bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
              No paid book sales yet.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Title</th>
                    <th className="pb-2 font-medium">Buyer</th>
                    <th className="pb-2 text-right font-medium">Amount</th>
                    <th className="pb-2 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentSales.map((sale, i) => (
                    <tr
                      key={`${sale.buyer}-${i}`}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="max-w-[180px] truncate py-2.5 pr-2 font-medium">
                        {sale.title}
                      </td>
                      <td className="max-w-[160px] truncate py-2.5 pr-2 text-muted-foreground">
                        {sale.buyer}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {dollarsPrecise(sale.amount)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {new Date(sale.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function PlanBar({
  name,
  count,
  pct,
  color,
}: {
  name: string
  count: number
  pct: number
  color: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground tabular-nums">
          {count.toLocaleString()} · {pct}%
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}
