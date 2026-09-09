"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { setUserStatus } from "@/app/actions/admin-moderation"
import { cn } from "@/lib/utils"

/**
 * Admin account-standing controls (Restrict / Suspend / Reinstate) on the user
 * detail page. This is part of the general user-management system and is
 * independent of the removed written-review feature. Actions are recorded in
 * the moderation audit trail. You cannot change your own account's status.
 */
export function AdminUserStatusControls({
  userId,
  status,
  statusReason,
  disabled,
}: {
  userId: string
  status: string
  statusReason: string | null
  disabled?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run(next: "active" | "restricted" | "suspended") {
    setError(null)
    start(async () => {
      try {
        const res = await setUserStatus(userId, next)
        if (res && "error" in res && res.error) {
          setError(res.error)
          return
        }
        router.refresh()
      } catch {
        setError("That action couldn't be completed. Please try again.")
      }
    })
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Account standing</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Current status:{" "}
            <span
              className={cn(
                "font-medium capitalize",
                status === "active" ? "text-foreground" : "text-destructive",
              )}
            >
              {status}
            </span>
            {statusReason ? ` · ${statusReason}` : ""}
          </p>
        </div>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {disabled ? (
        <p className="mt-3 text-xs text-muted-foreground">
          You can&apos;t change your own account&apos;s status.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {status !== "restricted" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run("restricted")}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              Restrict
            </button>
          ) : null}
          {status !== "suspended" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run("suspended")}
              className="rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              Suspend
            </button>
          ) : null}
          {status !== "active" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run("active")}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
            >
              Reinstate
            </button>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
