"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
import { generatePremiumSpeech } from "@/app/actions/speech"
import { PREMIUM_VOICES, getPremiumVoice } from "@/lib/voices"
import { Button } from "@/components/ui/button"
import { VoiceAvatar } from "@/components/voice-avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

// Two distinct ultra-realistic voices make the two-host format feel natural.
const DEFAULT_HOST_VOICE = "el-sarah"
const DEFAULT_GUEST_VOICE = "el-brian"

function isHostSpeaker(speaker: string) {
  return speaker.toLowerCase().includes("host")
}

function PodcastPanel({ text }: { text: string }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PodcastResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hostVoice, setHostVoice] = useState(DEFAULT_HOST_VOICE)
  const [guestVoice, setGuestVoice] = useState(DEFAULT_GUEST_VOICE)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache of generated audio URLs keyed by `${segmentIndex}:${voiceId}`.
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Monotonic token used to cancel an in-flight playback loop.
  const playTokenRef = useRef(0)
  // Resolver for the segment currently awaiting playback, so stop() can unblock.
  const finishCurrentRef = useRef<(() => void) | null>(null)

  // Auto-generate the podcast script from the current document text.
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
    }
  }, [text])

  useEffect(() => {
    const el = new Audio()
    audioRef.current = el
    return () => {
      playTokenRef.current++
      el.pause()
      el.removeAttribute("src")
    }
  }, [])

  const voiceIdForSegment = useCallback(
    (i: number) => {
      const seg = result?.segments[i]
      if (!seg) return hostVoice
      return isHostSpeaker(seg.speaker) ? hostVoice : guestVoice
    },
    [result, hostVoice, guestVoice],
  )

  const fetchSegmentUrl = useCallback(
    async (i: number): Promise<string | null> => {
      const seg = result?.segments[i]
      if (!seg) return null
      const voice = voiceIdForSegment(i)
      const key = `${i}:${voice}`
      const cached = cacheRef.current.get(key)
      if (cached) return cached
      const res = await generatePremiumSpeech(seg.line, voice)
      if ("error" in res) throw new Error(res.error)
      cacheRef.current.set(key, res.url)
      return res.url
    },
    [result, voiceIdForSegment],
  )

  const stopPlayback = useCallback(() => {
    playTokenRef.current++
    const el = audioRef.current
    if (el) {
      el.pause()
      el.removeAttribute("src")
    }
    finishCurrentRef.current?.()
    finishCurrentRef.current = null
    setPlaying(false)
    setBuffering(false)
    setActiveIndex(-1)
  }, [])

  // Plays a single URL to completion; resolves on end/error or when cancelled.
  const playUrl = useCallback((el: HTMLAudioElement, url: string) => {
    return new Promise<void>((resolve) => {
      const done = () => {
        el.removeEventListener("ended", done)
        el.removeEventListener("error", done)
        finishCurrentRef.current = null
        resolve()
      }
      finishCurrentRef.current = done
      el.addEventListener("ended", done)
      el.addEventListener("error", done)
      el.src = url
      el.currentTime = 0
      void el.play().catch(() => {
        /* autoplay restrictions: resolve so the loop can advance */
        done()
      })
    })
  }, [])

  const playFrom = useCallback(
    async (start: number) => {
      if (!result) return
      const el = audioRef.current
      if (!el) return
      const token = ++playTokenRef.current
      setError(null)
      setPlaying(true)

      for (let i = start; i < result.segments.length; i++) {
        if (playTokenRef.current !== token) return
        setActiveIndex(i)
        setBuffering(true)
        let url: string | null = null
        try {
          url = await fetchSegmentUrl(i)
        } catch (e) {
          if (playTokenRef.current !== token) return
          setError(
            e instanceof Error
              ? e.message
              : "Could not generate audio. Please try again.",
          )
          stopPlayback()
          return
        }
        if (playTokenRef.current !== token) return
        setBuffering(false)
        if (!url) continue
        // Prefetch the next segment's audio while this one plays.
        if (i + 1 < result.segments.length) {
          void fetchSegmentUrl(i + 1).catch(() => {})
        }
        await playUrl(el, url)
      }

      if (playTokenRef.current === token) {
        setPlaying(false)
        setBuffering(false)
        setActiveIndex(-1)
      }
    },
    [result, fetchSegmentUrl, playUrl, stopPlayback],
  )

  function changeHostVoice(v: string) {
    stopPlayback()
    setHostVoice(v)
  }
  function changeGuestVoice(v: string) {
    stopPlayback()
    setGuestVoice(v)
  }

  if (loading) return <Loading label="Producing your podcast…" />
  if (error && !result) return <ErrorNote message={error} />
  if (!result) return null

  const hostPersona = getPremiumVoice(hostVoice)
  const guestPersona = getPremiumVoice(guestVoice)

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <VoicePicker label="Host voice" value={hostVoice} onChange={changeHostVoice} />
        <VoicePicker
          label="Guest voice"
          value={guestVoice}
          onChange={changeGuestVoice}
        />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-balance">{result.title}</h3>
        <Button
          size="sm"
          variant={playing ? "secondary" : "default"}
          onClick={playing ? stopPlayback : () => playFrom(0)}
          className="shrink-0 gap-1.5"
        >
          {buffering ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Loading
            </>
          ) : playing ? (
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

      <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
        {hostPersona && (
          <span className="flex items-center gap-1.5">
            <VoiceAvatar
              name={hostPersona.name}
              image={hostPersona.image}
              size={22}
              alt=""
            />
            Host · {hostPersona.name}
          </span>
        )}
        {guestPersona && (
          <span className="flex items-center gap-1.5">
            <VoiceAvatar
              name={guestPersona.name}
              image={guestPersona.image}
              size={22}
              alt=""
            />
            Guest · {guestPersona.name}
          </span>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {result.segments.map((seg, i) => {
          const isHost = isHostSpeaker(seg.speaker)
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

function VoicePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  // NB: this must NOT be a <label>. Wrapping the Radix Select trigger in a
  // <label> makes the label forward its click to the trigger button, firing the
  // open toggle twice so the menu instantly re-closes and the voice never
  // switches. A plain <div> with a sibling caption avoids that.
  const persona = getPremiumVoice(value)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="h-12">
          <SelectValue>
            {persona ? (
              <span className="flex items-center gap-2">
                <VoiceAvatar
                  name={persona.name}
                  image={persona.image}
                  size={24}
                  alt=""
                />
                <span className="text-sm font-medium">{persona.name}</span>
              </span>
            ) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[min(60vh,26rem)]">
          {PREMIUM_VOICES.map((v) => (
            <SelectItem key={v.id} value={v.id} className="py-2">
              <span className="flex items-center gap-2.5">
                <VoiceAvatar name={v.name} image={v.image} size={32} alt="" />
                <span className="flex flex-col leading-tight">
                  <span className="text-sm font-medium">{v.name}</span>
                  <span className="text-xs text-muted-foreground">{v.tagline}</span>
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
