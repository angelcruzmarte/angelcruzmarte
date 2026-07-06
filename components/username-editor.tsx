"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AtSign, Check, Loader2, Pencil, X } from "lucide-react"
import { updateUsername } from "@/app/actions/profile"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export function UsernameEditor({ username }: { username: string | null }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(username ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateUsername(value)
      if (!res.ok) {
        setError(res.error ?? "Could not save.")
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(username ?? "")
          setError(null)
          setEditing(true)
        }}
        className={cn(
          "group mx-auto flex items-center gap-1 rounded-full px-2 py-0.5 text-sm transition-colors hover:bg-secondary",
          username ? "text-muted-foreground" : "text-primary",
        )}
      >
        <AtSign className="h-3.5 w-3.5" aria-hidden="true" />
        {username ? (
          <span className="font-medium">{username}</span>
        ) : (
          <span className="font-semibold">Add a username</span>
        )}
        <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-70" />
      </button>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <AtSign
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            autoFocus
            value={value}
            onChange={(e) =>
              setValue(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
            }
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === "Enter") save()
              if (e.key === "Escape") setEditing(false)
            }}
            placeholder="username"
            className="h-9 pl-8"
            maxLength={20}
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label="Save username"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {error ? (
        <p className="mt-1.5 text-center text-xs text-destructive">{error}</p>
      ) : (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">
          Letters, numbers and underscores. 3&ndash;20 characters.
        </p>
      )}
    </div>
  )
}
