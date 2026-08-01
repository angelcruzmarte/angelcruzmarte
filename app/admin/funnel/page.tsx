import { Eye, MousePointerClick, UserCheck, UserX } from "lucide-react"
import { getFunnelData } from "@/app/actions/funnel"
import { Card } from "@/components/ui/card"

function fmtDateTime(d: Date): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default async function AdminFunnelPage() {
  const funnel = await getFunnelData()

  const stats = [
    {
      label: "Pricing views",
      value: funnel.views.toLocaleString(),
      hint: "Total page views tracked",
      icon: Eye,
    },
    {
      label: "Unique visitors",
      value: funnel.visitors.toLocaleString(),
      hint: "Distinct anonymous visitors",
      icon: MousePointerClick,
    },
    {
      label: "Registered",
      value: funnel.converted.toLocaleString(),
      hint: `${funnel.conversionRate.toFixed(1)}% conversion`,
      icon: UserCheck,
    },
    {
      label: "Didn't register",
      value: funnel.unconverted.toLocaleString(),
      hint: "Viewed pricing, no signup",
      icon: UserX,
    },
  ]

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Pricing funnel</h1>
      <p className="mt-1 text-muted-foreground">
        How many people view pricing versus how many complete registration.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums tracking-tight">
              {s.value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>
          </Card>
        ))}
      </div>

      {/* Conversion bar */}
      <Card className="mt-6 p-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Visitor → registration</span>
          <span className="text-muted-foreground">
            {funnel.conversionRate.toFixed(1)}%
          </span>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.min(100, Math.max(2, funnel.conversionRate))}%`,
            }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {funnel.converted.toLocaleString()} of{" "}
          {funnel.visitors.toLocaleString()} visitors who viewed pricing went on
          to create an account.
        </p>
      </Card>

      {/* Recent non-converting visits */}
      <Card className="mt-6 overflow-hidden p-0">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-semibold">Recent visits without signup</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Anonymous visitors who viewed pricing but haven&apos;t registered.
          </p>
        </div>
        {funnel.recentUnconverted.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            No un-converted visits recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {funnel.recentUnconverted.map((v, i) => (
              <li
                key={`${v.visitorId}-${i}`}
                className="flex items-center justify-between gap-4 px-6 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    Visitor {v.visitorId.slice(0, 8)}
                    <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      {v.path}
                    </span>
                  </p>
                  {v.referrer && (
                    <p className="truncate text-xs text-muted-foreground">
                      from {v.referrer}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {fmtDateTime(v.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
