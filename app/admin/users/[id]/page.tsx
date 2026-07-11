import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"
import { getUserById, getUserBilling } from "@/app/actions/admin"
import { getCurrentUser } from "@/lib/session"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { AdminUserRoleToggle } from "@/components/admin-user-role-toggle"

function money(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100)
}

function fmtDate(d: Date | number | null): string {
  if (d == null) return "—"
  const date = typeof d === "number" ? new Date(d * 1000) : new Date(d)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [user, billing, current] = await Promise.all([
    getUserById(id),
    getUserBilling(id),
    getCurrentUser(),
  ])
  if (!user) notFound()

  const statusLabel =
    user.subscriptionStatus === "active"
      ? "Active subscriber"
      : user.subscriptionStatus === "trialing"
        ? "On free trial"
        : user.subscriptionStatus === "canceled"
          ? "Canceled"
          : "Free user"

  const details: { label: string; value: string }[] = [
    { label: "Email", value: user.email },
    { label: "Username", value: user.username ? `@${user.username}` : "—" },
    { label: "Role", value: user.role === "admin" ? "Admin" : "User" },
    {
      label: "Plan",
      value:
        user.plan === "yearly"
          ? "Annual"
          : user.plan === "monthly"
            ? "Monthly"
            : "—",
    },
    { label: "Signed up", value: fmtDate(user.createdAt) },
    { label: "Renews", value: fmtDate(user.currentPeriodEnd) },
    { label: "Used free trial", value: user.hasUsedTrial ? "Yes" : "No" },
    {
      label: "Onboarding",
      value: user.onboardingComplete ? "Complete" : "Incomplete",
    },
  ]

  return (
    <div className="px-4 py-8 sm:px-8">
      <Link
        href="/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{user.name}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Badge
              variant={
                user.subscriptionStatus === "active" ? "default" : "secondary"
              }
            >
              {statusLabel}
            </Badge>
            {billing.cancelAtPeriodEnd && (
              <Badge variant="outline">Cancels at period end</Badge>
            )}
          </div>
        </div>
        <AdminUserRoleToggle
          userId={user.id}
          role={user.role}
          disabled={user.id === current?.id}
        />
      </div>

      {/* Billing summary */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Card className="border-primary/20 bg-primary/5 p-5">
          <p className="text-sm text-muted-foreground">Lifetime paid</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {money(billing.totalPaid)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Next renewal</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {fmtDate(billing.renewalDate)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Invoices</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {billing.invoices.length}
          </p>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Account details */}
        <Card className="p-6">
          <h2 className="font-semibold">Account details</h2>
          <dl className="mt-4 flex flex-col gap-3">
            {details.map((d) => (
              <div
                key={d.label}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <dt className="text-muted-foreground">{d.label}</dt>
                <dd className="truncate text-right font-medium">{d.value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        {/* Billing history */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Billing history</h2>
            <span className="text-xs text-muted-foreground">Live from Stripe</span>
          </div>

          {billing.error && (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {billing.error}
            </p>
          )}

          {!billing.error && billing.invoices.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              No invoices yet. This user has not been billed.
            </p>
          )}

          {billing.invoices.length > 0 && (
            <ul className="mt-4 divide-y divide-border">
              {billing.invoices.map((inv) => (
                <li
                  key={inv.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {inv.description || "Subscription"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(inv.created)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">
                      {money(inv.amount, inv.currency)}
                    </span>
                    <Badge
                      variant={inv.status === "paid" ? "default" : "secondary"}
                    >
                      {inv.status ?? "—"}
                    </Badge>
                    {inv.hostedUrl && (
                      <a
                        href={inv.hostedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="View invoice"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
