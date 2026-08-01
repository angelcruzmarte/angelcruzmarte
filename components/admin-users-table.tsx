"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, Search } from "lucide-react"
import type { AdminUser } from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Filter = "all" | "paying" | "trialing" | "free"

function planLabel(u: AdminUser): string {
  if (u.plan === "yearly") return "Annual"
  if (u.plan === "monthly") return "Monthly"
  return "—"
}

function statusInfo(u: AdminUser): { label: string; variant: "default" | "secondary" | "outline" } {
  const s = u.subscriptionStatus
  if (s === "active") return { label: "Active", variant: "default" }
  if (s === "trialing") return { label: "Trialing", variant: "outline" }
  if (s === "canceled") return { label: "Canceled", variant: "secondary" }
  if (s === "past_due") return { label: "Past due", variant: "secondary" }
  return { label: "Free", variant: "secondary" }
}

function fmtDate(d: Date | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function AdminUsersTable({ users }: { users: AdminUser[] }) {
  const [filter, setFilter] = useState<Filter>("all")
  const [query, setQuery] = useState("")

  const counts = useMemo(
    () => ({
      all: users.length,
      paying: users.filter((u) => u.subscriptionStatus === "active").length,
      trialing: users.filter((u) => u.subscriptionStatus === "trialing").length,
      free: users.filter(
        (u) => u.subscriptionStatus !== "active" && u.subscriptionStatus !== "trialing",
      ).length,
    }),
    [users],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter((u) => {
      if (filter === "paying" && u.subscriptionStatus !== "active") return false
      if (filter === "trialing" && u.subscriptionStatus !== "trialing")
        return false
      if (
        filter === "free" &&
        (u.subscriptionStatus === "active" || u.subscriptionStatus === "trialing")
      )
        return false
      if (!q) return true
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [users, filter, query])

  const tabs: { id: Filter; label: string }[] = [
    { id: "all", label: `All ${counts.all}` },
    { id: "paying", label: `Paying ${counts.paying}` },
    { id: "trialing", label: `Trialing ${counts.trialing}` },
    { id: "free", label: `Free ${counts.free}` },
  ]

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                filter === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
          />
        </div>
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        {/* Header row (desktop) */}
        <div className="hidden grid-cols-[1.6fr_1fr_0.8fr_1fr_1fr_auto] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <span>User</span>
          <span>Status</span>
          <span>Plan</span>
          <span>Signed up</span>
          <span>Renews</span>
          <span className="w-5" />
        </div>

        {filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No users match your filters.
          </p>
        )}

        <ul className="divide-y divide-border">
          {filtered.map((u) => {
            const status = statusInfo(u)
            return (
              <li key={u.id}>
                <Link
                  href={`/users/${u.id}`}
                  className="grid grid-cols-1 items-center gap-2 px-5 py-4 transition-colors hover:bg-muted/40 lg:grid-cols-[1.6fr_1fr_0.8fr_1fr_1fr_auto] lg:gap-4"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {u.name}
                      {u.role === "admin" && (
                        <Badge variant="outline" className="text-[10px]">
                          Admin
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {u.email}
                    </p>
                  </div>
                  <div>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {planLabel(u)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmtDate(u.createdAt)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmtDate(u.currentPeriodEnd)}
                  </div>
                  <ChevronRight className="hidden h-4 w-4 text-muted-foreground lg:block" />
                </Link>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
