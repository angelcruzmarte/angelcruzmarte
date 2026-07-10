"use client"

import { useState } from "react"
import { Check, HelpCircle, Loader2, X } from "lucide-react"
import { generateQuiz, type QuizQuestion } from "@/app/actions/ai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function AIQuizTool() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})

  async function run() {
    if (!input.trim() || loading) return
    setLoading(true)
    setError(null)
    setQuestions(null)
    setAnswers({})
    try {
      const r = await generateQuiz(input)
      if (r.error) setError(r.error)
      else setQuestions(r.questions)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste text to generate a comprehension quiz…"
        rows={8}
      />
      <Button onClick={run} disabled={loading || !input.trim()} className="w-full" size="lg">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><HelpCircle className="h-4 w-4" /> Generate quiz</>}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {questions && (
        <ol className="space-y-4">
          {questions.map((q, qi) => {
            const chosen = answers[qi]
            const answered = chosen !== undefined
            return (
              <li key={qi} className="rounded-2xl border border-border bg-card p-5">
                <p className="mb-3 font-medium">
                  {qi + 1}. {q.question}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const isCorrect = oi === q.correctIndex
                    const isChosen = oi === chosen
                    return (
                      <button
                        key={oi}
                        type="button"
                        disabled={answered}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [qi]: oi }))
                        }
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          !answered && "border-border hover:bg-secondary",
                          answered && isCorrect && "border-primary bg-primary/10",
                          answered &&
                            isChosen &&
                            !isCorrect &&
                            "border-destructive bg-destructive/10",
                          answered &&
                            !isChosen &&
                            !isCorrect &&
                            "border-border opacity-60",
                        )}
                      >
                        {opt}
                        {answered && isCorrect && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                        {answered && isChosen && !isCorrect && (
                          <X className="h-4 w-4 text-destructive" />
                        )}
                      </button>
                    )
                  })}
                </div>
                {answered && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {q.explanation}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
