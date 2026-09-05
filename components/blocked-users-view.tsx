"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Loader2, UserX } from "lucide-react"
import { unblockUser, type BlockedUser } from "@/app/actions/moderation"

export function BlockedUsersView({ users }: { users: BlockedUser[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleUnblock(id: string) {
    setBusyId(id)
    startTransition(async () => {
      await unblockUser(id)
      setBusyId(null)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/app/profile"
          aria-label="Back to settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">Blocked Users</h1>
      </header>

      <p className="mb-4 text-sm text-muted-foreground">
        You won&apos;t see reviews or other content from people you block, and
        they can&apos;t interact with you. Unblock anyone at any time.
      </p>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <UserX className="h-6 w-6" />
          </span>
          <p className="font-medium">No blocked users</p>
          <p className="mt-1 text-sm text-muted-foreground">
            People you block will appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
            >
              <Avatar name={u.name} image={u.image} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{u.name}</p>
                {u.username ? (
                  <p className="truncate text-xs text-muted-foreground">
                    @{u.username}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => handleUnblock(u.id)}
                disabled={pending && busyId === u.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
              >
                {pending && busyId === u.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Unblock"
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  const initials =
    name
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U"
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-bold text-foreground">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image || "/placeholder.svg"} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}
