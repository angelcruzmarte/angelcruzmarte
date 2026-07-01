"use client"

import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { generateSummary, type SummaryResult } from "@/app/actions/ai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export function AISummaryTool() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SummaryResult | null>(null)

  async function run() {
    if (!input.trim() || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await generateSummary(input))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste the text you want summarized…"
        rows={8}
      />
      <Button onClick={run} disabled={loading || !input.trim()} className="w-full" size="lg">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4" /> Summarize</>}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Summary
            </h3>
            <p className="leading-relaxed">{result.summary}</p>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Key points
            </h3>
            <ul className="space-y-1.5">
              {result.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
