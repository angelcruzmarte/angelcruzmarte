"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import * as Icons from "lucide-react"
import { Check, Loader2 } from "lucide-react"
import { INTERESTS } from "@/lib/interests"
import { saveInterests } from "@/app/actions/interests"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as any)[name] ?? Icons.Tag
  return <Icon className={className} />
}

export function InterestPicker({ initial }: { initial: string[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set(initial))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function toggle(id: string) {
    setSaved(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveInterests(Array.from(selected))
      setSaved(true)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {INTERESTS.map((interest) => {
          const active = selected.has(interest.id)
          return (
            <button
              key={interest.id}
              type="button"
              onClick={() => toggle(interest.id)}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary",
              )}
            >
              <DynamicIcon name={interest.icon} className="h-4 w-4" />
              {interest.label}
            </button>
          )
        })}
      </div>

      <div className="sticky bottom-24 mt-8">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="lg"
          className="w-full"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              Saved
            </>
          ) : (
            `Save ${selected.size > 0 ? `(${selected.size})` : "interests"}`
          )}
        </Button>
      </div>
    </div>
  )
}
