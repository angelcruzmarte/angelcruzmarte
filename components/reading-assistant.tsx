"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Sparkles, X, ArrowUp, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

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
export function ReadingAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistant" }),
    onError: async (err) => {
      // The route returns JSON { error } with 429 when out of quota.
      try {
        const parsed = JSON.parse(err.message)
        setNotice(parsed.error ?? "Something went wrong. Please try again.")
      } catch {
        setNotice("Something went wrong. Please try again.")
      }
    },
  })

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, busy])

  function send(text: string) {
    const value = text.trim()
    if (!value || busy) return
    setNotice(null)
    setInput("")
    sendMessage({ text: value })
  }

  return (
    <>
      {/* Launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask VOXYFI for book recommendations"
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:right-[calc(50%-20rem)]"
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
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">VOXYFI Assistant</p>
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
                <p className="text-foreground">{notice}</p>
                <Link
                  href="/subscribe"
                  className="mt-1 inline-block text-sm font-semibold text-primary underline underline-offset-2"
                >
                  See premium
                </Link>
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
