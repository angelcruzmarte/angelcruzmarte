"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldCheck, ShieldOff, Sparkles } from "lucide-react"
import { setUserRole } from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Subscriber = {
  id: string
  name: string
  email: string
  role: string
  plan: string | null
  subscriptionStatus: string | null
  currentPeriodEnd: Date | null
  createdAt: Date
}

type PlanFilter = "all" | "paying" | "free"

/** A user is "paying" when their subscription is active or trialing. */
function isPaying(sub: Subscriber): boolean {
  return (
    sub.subscriptionStatus === "active" ||
    sub.subscriptionStatus === "trialing"
  )
}

function statusVariant(status: string | null) {
  if (status === "active" || status === "trialing") return "default" as const
  return "secondary" as const
}

export function AdminSubscribersTable({
  subscribers,
  currentUserId,
}: {
  subscribers: Subscriber[]
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<PlanFilter>("all")

  const { payingCount, freeCount } = useMemo(() => {
    let paying = 0
    for (const s of subscribers) if (isPaying(s)) paying += 1
    return { payingCount: paying, freeCount: subscribers.length - paying }
  }, [subscribers])

  const filtered = useMemo(() => {
    if (filter === "paying") return subscribers.filter(isPaying)
    if (filter === "free") return subscribers.filter((s) => !isPaying(s))
    return subscribers
  }, [subscribers, filter])

  const tabs: { id: PlanFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: subscribers.length },
    { id: "paying", label: "Paying", count: payingCount },
    { id: "free", label: "Free", count: freeCount },
  ]

  function toggleRole(id: string, current: string) {
    setPendingId(id)
    startTransition(async () => {
      await setUserRole(id, current === "admin" ? "user" : "admin")
      router.refresh()
      setPendingId(null)
    })
  }

  return (
    <div className="space-y-4">
      <div
        className="inline-flex items-center gap-1 rounded-lg border border-border bg-secondary p-1"
        role="tablist"
        aria-label="Filter subscribers by plan"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              filter === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-xs",
                filter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Subscriber</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No {filter === "all" ? "" : filter} users to show.
                </td>
              </tr>
            ) : null}
            {filtered.map((sub) => (
              <tr key={sub.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{sub.name}</div>
                  <div className="text-xs text-muted-foreground">{sub.email}</div>
                </td>
                <td className="px-4 py-3">
                  {isPaying(sub) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Paying
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      Free
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(sub.subscriptionStatus)}>
                    {sub.subscriptionStatus ?? "none"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {sub.plan ?? "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(sub.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={sub.role === "admin" ? "default" : "secondary"}>
                    {sub.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {sub.id === currentUserId ? (
                    <span className="text-xs text-muted-foreground">You</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={isPending && pendingId === sub.id}
                      onClick={() => toggleRole(sub.id, sub.role)}
                    >
                      {isPending && pendingId === sub.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : sub.role === "admin" ? (
                        <ShieldOff className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {sub.role === "admin" ? "Revoke admin" : "Make admin"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </Card>
    </div>
  )
}
