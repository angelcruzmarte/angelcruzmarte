"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Sparkles, X, ArrowUp, BookOpen, RefreshCw, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { LogoMark } from "@/components/logo-mark"
import { usePlayer } from "@/components/player-provider"

type CatalogPick = {
  id: number
  title: string
  author: string
  category: string
  blurb: string
  url: string
}

// A few starter prompts so first-time users know what to ask.
const SUGGESTIONS = [
  "Recommend a gripping mystery",
  "Something uplifting to listen to",
  "Classics like Jane Austen",
]

/**
 * Floating "Ask VOXYFI" reading assistant. Streams from /api/assistant, which
 * recommends ONLY real catalog books (via a server-side tool). Recommendation
 * cards deep-link to book detail pages — the assistant never touches checkout.
 * Free users spend one AI token per message (same bucket as other AI tools);
 * subscribers are unlimited. A 429 surfaces the quota/upgrade message inline.
 */
type Notice = {
  kind: "quota" | "rate_limit" | "error" | "retrying"
  text: string
}

// Wait this long before automatically retrying a rate-limited request. Gives
// the shared AI Gateway limit a moment to recover without hammering it.
const AUTO_RETRY_DELAY_MS = 4000

export function ReadingAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState<Notice | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // The last thing the reader asked, so we can transparently retry it.
  const lastTextRef = useRef("")
  // How many automatic retries we've spent on the current message (cap: 1).
  const autoRetriesRef = useRef(0)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
    onError: (err) => {
      // Both the pre-stream guard (JSON body) and streaming errors deliver a
      // structured { kind, error } string. Fall back gracefully if parsing fails.
      let kind: Notice["kind"] = "error"
      let text = "Something went wrong. Please try again."
      try {
        const parsed = JSON.parse(err.message)
        if (parsed?.error) text = parsed.error
        if (parsed?.kind) kind = parsed.kind
      } catch {
        // Non-JSON error (network, etc.) — keep the neutral default.
      }

      // Rate limits are transient: quietly auto-retry once before surfacing a
      // manual control, so most blips resolve without the reader doing anything.
      if (kind === "rate_limit" && autoRetriesRef.current < 1) {
        autoRetriesRef.current += 1
        setNotice({
          kind: "retrying",
          text: "The assistant is busy — retrying in a moment…",
        })
        // Resend directly (not via `dispatch`) so a stale `busy` guard can't
        // swallow the retry. `sendMessage` and the ref are both stable here.
        retryTimerRef.current = setTimeout(() => {
          const value = lastTextRef.current.trim()
          if (!value) return
          setNotice(null)
          sendMessage({ text: value })
        }, AUTO_RETRY_DELAY_MS)
        return
      }

      setNotice({ kind, text })
    },
  })

  const busy = status === "submitted" || status === "streaming"

  // On the immersive reader / full player, a bottom-docked card already provides
  // a "Chat" tool for questions about the current document. That card and this
  // floating launcher both live at the bottom-right, so the pill was covering
  // the docked card's Podcast/Quiz tabs. Step aside entirely on that screen
  // (the docked Chat covers document Q&A); the launcher returns everywhere else.
  const { fullPlayerMounted, session, status: playerStatus } = usePlayer()

  // The compact mini-player docks at `bottom-24` (same spot as this launcher)
  // whenever something is playing outside the full reader. When it's showing we
  // lift the launcher above it so the docked player never covers the pill.
  const miniPlayerVisible =
    !!session && playerStatus !== "idle" && !fullPlayerMounted

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  // Clear any pending retry timer on unmount.
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    }
  }, [])

  // Core send. `isRetry` preserves the auto-retry counter; a fresh send resets it.
  function dispatch(text: string, isRetry: boolean) {
    const value = text.trim()
    if (!value || busy) return
    if (!isRetry) autoRetriesRef.current = 0
    lastTextRef.current = value
    setNotice(null)
    setInput("")
    sendMessage({ text: value })
  }

  function send(text: string) {
    dispatch(text, false)
  }

  // Manual retry from the notice — treated as a fresh attempt so the reader can
  // keep trying (and the gentle auto-retry can kick in again if needed).
  function retry() {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    dispatch(lastTextRef.current, false)
  }

  // Hide the floating assistant while the full reader/player is on screen to
  // avoid overlapping its docked tool card (Chat/Summary/Podcast/Quiz).
  if (fullPlayerMounted) return null

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask VOXYFI for book recommendations"
          className={cn(
            "fixed right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-[transform,bottom] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-[calc(50%-20rem)]",
            miniPlayerVisible ? "bottom-44" : "bottom-24",
          )}
        >
          <Sparkles className="h-4 w-4" />
          Ask VOXYFI
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="VOXYFI reading assistant"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[70svh] max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-[calc(50%-20rem)] sm:h-[32rem] sm:w-96 sm:rounded-2xl"
        >
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[0.7rem] bg-brand-gradient text-white shadow-[0_1px_3px_rgba(18,63,46,0.4)] ring-1 ring-inset ring-white/20">
                <LogoMark className="h-[18px] w-[18px]" />
              </span>
              <div className="leading-tight">
                <p className="voxyfi-wordmark text-sm text-foreground">
                  VOXYFI Assistant
                </p>
                <p className="text-xs text-muted-foreground">
                  Finds books from our catalog
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Hi! Tell me what you&apos;re in the mood to read and I&apos;ll
                  suggest books from the VOXYFI library.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <AssistantMessage key={m.id} message={m} />
            ))}

            {busy && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            )}

            {notice && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                <p className="flex items-center gap-2 text-foreground">
                  {notice.kind === "retrying" && (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-primary"
                      aria-hidden="true"
                    />
                  )}
                  <span>{notice.text}</span>
                </p>

                {notice.kind === "quota" && (
                  <Link
                    href="/subscribe"
                    className="mt-1 inline-block text-sm font-semibold text-primary underline underline-offset-2"
                  >
                    See premium
                  </Link>
                )}

                {(notice.kind === "rate_limit" || notice.kind === "error") && (
                  <button
                    type="button"
                    onClick={retry}
                    disabled={busy}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(input)
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !e.nativeEvent.isComposing &&
                  e.keyCode !== 229
                ) {
                  e.preventDefault()
                  send(input)
                }
              }}
              placeholder="What should I read next?"
              aria-label="Ask for a book recommendation"
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  )
}

function AssistantMessage({ message }: { message: ReturnType<typeof useChat>["messages"][number] }) {
  const isUser = message.role === "user"

  // Collect streamed text and any catalog picks from tool outputs.
  let text = ""
  const picks: CatalogPick[] = []
  for (const part of message.parts) {
    if (part.type === "text") {
      text += part.text
    } else if (
      part.type === "tool-searchCatalog" &&
      "output" in part &&
      Array.isArray(part.output)
    ) {
      for (const p of part.output as CatalogPick[]) picks.push(p)
    }
  }

  // De-duplicate picks by id (the model may search more than once).
  const uniquePicks = Array.from(new Map(picks.map((p) => [p.id, p])).values())

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {text && (
          <div
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {text}
          </div>
        )}
        {!isUser && uniquePicks.length > 0 && (
          <ul className="space-y-2">
            {uniquePicks.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.url}
                  className="flex gap-2 rounded-xl border border-border bg-background p-2.5 transition-colors hover:bg-muted"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BookOpen className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {p.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.author} · {p.category}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
