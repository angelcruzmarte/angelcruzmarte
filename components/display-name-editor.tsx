"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Pencil, X } from "lucide-react"
import { updateDisplayName } from "@/app/actions/profile"
import { Input } from "@/components/ui/input"

export function DisplayNameEditor({ name }: { name: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateDisplayName(value)
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
      <div className="flex items-center justify-center gap-2">
        <h1 className="text-xl font-bold tracking-tight">{name}</h1>
        <button
          type="button"
          onClick={() => {
            setValue(name)
            setEditing(true)
          }}
          aria-label="Edit name"
          className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === "Enter") save()
            if (e.key === "Escape") setEditing(false)
          }}
          className="h-9 text-center"
          maxLength={60}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending}
          aria-label="Save name"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
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
      {error && <p className="mt-1.5 text-center text-xs text-destructive">{error}</p>}
    </div>
  )
}
