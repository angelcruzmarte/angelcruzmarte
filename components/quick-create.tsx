"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowUp, Loader2 } from "lucide-react"
import { quickGenerate } from "@/app/actions/ai"
import { createDocument } from "@/app/actions/documents"
import { cn } from "@/lib/utils"

export function QuickCreate() {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const prompt = value.trim()
    if (!prompt || loading) return
    // Free users are allowed through: the server enforces the shared daily AI
    // quota and returns a friendly "subscribe" message once it's exhausted.
    setLoading(true)
    setError(null)
    try {
      const text = await quickGenerate(prompt)
      const doc = await createDocument({
        title: prompt.slice(0, 60),
        content: text,
        sourceType: "ai",
      })
      router.push(`/app/listen/${doc.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type anything to generate and listen…"
          className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          disabled={loading}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !value.trim()}
          aria-label="Generate"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
            (loading || !value.trim()) && "opacity-40",
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
