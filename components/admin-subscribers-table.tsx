"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, ShieldCheck, ShieldOff } from "lucide-react"
import { setUserRole } from "@/app/actions/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

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

  function toggleRole(id: string, current: string) {
    setPendingId(id)
    startTransition(async () => {
      await setUserRole(id, current === "admin" ? "user" : "admin")
      router.refresh()
      setPendingId(null)
    })
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Subscriber</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {subscribers.map((sub) => (
              <tr key={sub.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{sub.name}</div>
                  <div className="text-xs text-muted-foreground">{sub.email}</div>
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
  )
}
