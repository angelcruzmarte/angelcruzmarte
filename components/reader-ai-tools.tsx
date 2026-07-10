"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  AudioLines,
  Check,
  HelpCircle,
  Loader2,
  MessageSquare,
  Pause,
  Play,
  Send,
  Sparkles,
  X,
} from "lucide-react"
import {
  askDocument,
  generatePodcast,
  generateQuiz,
  generateSummary,
  type PodcastResult,
  type QuizQuestion,
  type SummaryResult,
} from "@/app/actions/ai"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Tool = "chat" | "summary" | "podcast" | "quiz"

const TOOLS: { id: Tool; label: string; Icon: typeof Sparkles }[] = [
  { id: "chat", label: "Chat", Icon: MessageSquare },
  { id: "summary", label: "Summary", Icon: Sparkles },
  { id: "podcast", label: "Podcast", Icon: AudioLines },
  { id: "quiz", label: "Quiz", Icon: HelpCircle },
]

/**
 * Speechify-style AI tools row for the reader. Each tab opens its own full
 * panel that runs the corresponding AI action against the current document
 * text. Opening a panel reports up via `onOpenChange` so the parent can pause
 * narration; closing it returns to the reader.
 */
export function ReaderAiTools({
  text,
  onOpenChange,
}: {
  text: string
  onOpenChange?: (open: boolean) => void
}) {
  const [active, setActive] = useState<Tool | null>(null)

  function open(tool: Tool) {
    setActive(tool)
    onOpenChange?.(true)
  }
  function close() {
    setActive(null)
    onOpenChange?.(false)
  }

  return (
    <>
      <div className="flex items-center justify-between gap-1">
        {TOOLS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => open(id)}
            className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            <Icon className="h-5 w-5 text-primary" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      {active && <ToolSheet tool={active} text={text} onClose={close} />}
    </>
  )
}

function ToolSheet({
  tool,
  text,
  onClose,
}: {
  tool: Tool
  text: string
  onClose: () => void
}) {
  const title =
    tool === "chat"
      ? "Ask about this document"
      : tool === "summary"
        ? "Summary"
        : tool === "podcast"
          ? "Podcast"
          : "Quiz"

  // Portal to <body> so the full-screen panel escapes the docked player card,
  // whose `backdrop-blur` would otherwise become the containing block for this
  // `position: fixed` element and clip it down to the small card.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)]">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={onClose}
          aria-label="Close and return to reading"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto px-5 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)]">
        {tool === "chat" && <ChatPanel text={text} />}
        {tool === "summary" && <SummaryPanel text={text} />}
        {tool === "podcast" && <PodcastPanel text={text} />}
        {tool === "quiz" && <QuizPanel text={text} />}
      </div>
    </div>,
    document.body,
  )
}

function ErrorNote({ message }: { message: string }) {
  return <p className="text-sm text-destructive">{message}</p>
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

function SummaryPanel({ text }: { text: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SummaryResult | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await generateSummary(text)
        if (cancelled) return
        if (r.error) setError(r.error)
        else setResult(r)
      } catch {
        if (!cancelled) setError("Something went wrong. Please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [text])

  if (loading) return <Loading label="Summarizing…" />
  if (error) return <ErrorNote message={error} />
  if (!result) return null

  return (
    <div className="space-y-4">
      <p className="leading-relaxed">{result.summary}</p>
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
  )
}

function QuizPanel({ text }: { text: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await generateQuiz(text)
        if (cancelled) return
        if (r.error) setError(r.error)
        else setQuestions(r.questions)
      } catch {
        if (!cancelled) setError("Something went wrong. Please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [text])

  if (loading) return <Loading label="Building your quiz…" />
  if (error) return <ErrorNote message={error} />
  if (!questions) return null

  return (
    <ol className="space-y-4">
      {questions.map((q, qi) => {
        const chosen = answers[qi]
        const answered = chosen !== undefined
        return (
          <li key={qi} className="rounded-2xl border border-border bg-background p-4">
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
                      answered && !isChosen && !isCorrect && "border-border opacity-60",
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
              <p className="mt-3 text-sm text-muted-foreground">{q.explanation}</p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function PodcastPanel({ text }: { text: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PodcastResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const cancelRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await generatePodcast(text)
        if (cancelled) return
        if (r.error) setError(r.error)
        else setResult(r)
      } catch {
        if (!cancelled) setError("Something went wrong. Please try again.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      cancelRef.current = true
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [text])

  function stop() {
    cancelRef.current = true
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setPlaying(false)
    setActiveIndex(-1)
  }

  function playPodcast() {
    if (!result || typeof window === "undefined" || !("speechSynthesis" in window))
      return
    cancelRef.current = false
    setPlaying(true)
    const voices = window.speechSynthesis.getVoices()
    const en = voices.filter((v) => v.lang.startsWith("en"))
    const host = en[0] ?? voices[0]
    const guest = en[1] ?? en[0] ?? voices[0]
    const speakAt = (i: number) => {
      if (cancelRef.current || i >= result.segments.length) {
        setPlaying(false)
        setActiveIndex(-1)
        return
      }
      setActiveIndex(i)
      const seg = result.segments[i]
      const u = new SpeechSynthesisUtterance(seg.line)
      const isHost = seg.speaker.toLowerCase().includes("host")
      const v = isHost ? host : guest
      if (v) {
        u.voice = v
        u.lang = v.lang
      }
      u.pitch = isHost ? 1 : 0.9
      u.onend = () => speakAt(i + 1)
      u.onerror = () => speakAt(i + 1)
      window.speechSynthesis.speak(u)
    }
    speakAt(0)
  }

  if (loading) return <Loading label="Producing your podcast…" />
  if (error) return <ErrorNote message={error} />
  if (!result) return null

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-balance">{result.title}</h3>
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={playing ? stop : playPodcast}
          className="shrink-0 gap-1.5"
        >
          {playing ? (
            <>
              <Pause className="h-4 w-4" /> Stop
            </>
          ) : (
            <>
              <Play className="h-4 w-4" /> Play
            </>
          )}
        </Button>
      </div>
      <div className="space-y-3">
        {result.segments.map((seg, i) => {
          const isHost = seg.speaker.toLowerCase().includes("host")
          return (
            <div
              key={i}
              className={cn(
                "rounded-xl px-3 py-2 transition-colors",
                activeIndex === i
                  ? "bg-primary/10"
                  : isHost
                    ? "bg-secondary"
                    : "bg-transparent",
              )}
            >
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  isHost ? "text-primary" : "text-muted-foreground",
                )}
              >
                {seg.speaker}
              </span>
              <p className="mt-0.5 leading-relaxed">{seg.line}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type ChatMessage = { role: "user" | "assistant"; content: string }

function ChatPanel({ text }: { text: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading])

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput("")
    setError(null)
    setMessages((m) => [...m, { role: "user", content: q }])
    setLoading(true)
    try {
      const r = await askDocument(text, q)
      if (r.error) setError(r.error)
      else setMessages((m) => [...m, { role: "assistant", content: r.answer }])
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 space-y-3">
        {messages.length === 0 && !loading && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Ask anything about what you&apos;re reading — key ideas, definitions,
            or a quick explanation.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "mr-auto bg-secondary text-secondary-foreground",
            )}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl bg-secondary px-3.5 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </div>
        )}
        {error && <ErrorNote message={error} />}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
        className="sticky bottom-0 mt-3 flex items-center gap-2 bg-background pt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="h-11 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-full"
          disabled={loading || !input.trim()}
          aria-label="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  )
}
