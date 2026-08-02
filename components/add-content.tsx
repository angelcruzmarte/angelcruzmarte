"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  BookImage,
  FolderOpen,
  LinkIcon,
  Loader2,
  Mic,
  ScanLine,
  Type,
} from "lucide-react"
import { createDocument, importFromUrl } from "@/app/actions/documents"
import { DocumentScanner } from "@/components/document-scanner"
import { DictationRecorder } from "@/components/dictation-recorder"
import { generateUploadThumbnail } from "@/lib/document-artwork"
import { releaseStream } from "@/lib/media-streams"
import { estimateReadingStats, formatMinutes } from "@/lib/reading-time"
import { haptic } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Mode = "text" | "link" | "file" | "scan"

// The import actions. Most switch the editor mode; "dictate" launches the
// full-screen recorder, and "book" navigates to the dedicated /app/scan route
// (neither is a persistent editor mode).
type ActionId = Mode | "dictate" | "book"

const actions: {
  id: ActionId
  label: string
  hint: string
  icon: React.ElementType
}[] = [
  { id: "text", label: "Type or Paste", hint: "Write or paste text", icon: Type },
  { id: "dictate", label: "Dictate", hint: "Speak it out loud", icon: Mic },
  { id: "scan", label: "Scan", hint: "Capture a document", icon: ScanLine },
  {
    id: "book",
    label: "Scan Book Cover",
    hint: "Identify a book by its cover",
    icon: BookImage,
  },
  { id: "link", label: "Link", hint: "Import a web page", icon: LinkIcon },
  { id: "file", label: "File", hint: "PDF, DOCX, EPUB…", icon: FolderOpen },
]

export function AddContent({
  initialMode = "text",
  autoDictate = false,
}: {
  initialMode?: Mode
  autoDictate?: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [recorderOpen, setRecorderOpen] = useState(autoDictate)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Streams are kept "warm" across recorder/scanner reopens and scan↔text mode
  // switches within this screen. But when the user actually LEAVES the Add
  // Content screen, force a full release of both devices so the OS mic/camera
  // indicator never stays lit while they browse elsewhere. (The mic is also
  // released by the recorder hook's own unmount; releasing here is harmless and
  // covers the camera, whose scanner unmounts on every mode switch.)
  useEffect(() => {
    return () => {
      releaseStream("mic")
      releaseStream("camera")
    }
  }, [])

  // Auto-grow the editor to fit its content (bounded) so long dictations don't
  // hide behind a scrollbar.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 520)}px`
  }, [content, mode])

  // --- System Back handling -------------------------------------------------
  // A launched action (the dictation recorder, or the scan / link / file
  // sub-screens) should behave like a screen you can back out of: pressing the
  // device or browser Back button — including the iOS Safari swipe — collapses
  // it to the base "Add content" screen instead of leaving /app/new entirely.
  // We push a lightweight history entry whenever an action opens and intercept
  // its popstate, so Back returns here rather than to the previous page.
  const inAction = recorderOpen || mode !== "text"
  const guardActiveRef = useRef(false)
  const wasInActionRef = useRef(false)
  // Mirror the latest values so the popstate listener (registered once) always
  // reads current state without re-subscribing.
  const stateRef = useRef({ mode, recorderOpen })
  stateRef.current = { mode, recorderOpen }

  useEffect(() => {
    const was = wasInActionRef.current
    wasInActionRef.current = inAction
    if (inAction && !was && !guardActiveRef.current) {
      // Entered an action from the base screen — add a Back target.
      guardActiveRef.current = true
      window.history.pushState({ voxyfiAddAction: true }, "")
    } else if (!inAction && was && guardActiveRef.current) {
      // Left the action via the UI (e.g. closed the recorder or tapped the
      // "Type or Paste" card): consume the guard entry we pushed so there's no
      // dead Back press left in the stack.
      guardActiveRef.current = false
      window.history.back()
    }
  }, [inAction])

  useEffect(() => {
    function onPopState() {
      // Ignore pops that aren't ours (e.g. the guard was already consumed).
      if (!guardActiveRef.current) return
      guardActiveRef.current = false
      const { mode: m, recorderOpen: r } = stateRef.current
      if (r || m !== "text") {
        setRecorderOpen(false)
        setMode("text")
        setError(null)
      }
    }
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  async function save(promise: Promise<{ id: number }>) {
    setLoading(true)
    setError(null)
    haptic("light")
    try {
      const doc = await promise
      haptic("success")
      router.push(`/app/listen/${doc.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      setLoading(false)
      haptic("error")
    }
  }

  function handleTextSubmit() {
    if (!content.trim()) {
      setError("Please enter some text.")
      return
    }
    save(
      createDocument({
        title: title.trim() || content.trim().slice(0, 60),
        content,
        sourceType: "text",
      }),
    )
  }

  function handleLinkSubmit() {
    if (!url.trim()) {
      setError("Please paste a link.")
      return
    }
    save(importFromUrl(url))
  }

  function selectAction(id: ActionId) {
    setError(null)
    haptic("light")
    if (id === "dictate") {
      setRecorderOpen(true)
      return
    }
    if (id === "book") {
      // Scan Book Cover is a full-screen experience on its own route rather
      // than an editor mode, so navigate there instead of switching mode.
      router.push("/app/scan")
      return
    }
    setMode(id)
  }

  const stats = estimateReadingStats(content)
  const listenLabel = formatMinutes(stats.listenMinutes)

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
          Add content
        </h1>
        <p className="mt-1 text-sm text-muted-foreground text-pretty">
          Turn anything into audio you can listen to.
        </p>
      </header>

      {/* Import action cards */}
      <div
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="tablist"
        aria-label="Choose how to add content"
      >
        {actions.map((a) => {
          const Icon = a.icon
          const selected = a.id === mode
          // Dictate and Scan Book Cover are "featured" launch actions that get a
          // soft accent so they're easy to discover among the import options.
          const featured = a.id === "dictate" || a.id === "book"
          return (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectAction(a.id)}
              className={cn(
                "group flex min-h-[92px] flex-col items-start justify-between rounded-2xl border p-3.5 text-left transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]",
                selected
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : featured
                    ? "border-primary/30 bg-primary/5 text-foreground hover:border-primary/50 hover:bg-primary/10"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
                  selected
                    ? "bg-primary-foreground/15 text-primary-foreground"
                    : "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-[18px] w-[18px]" />
              </span>
              <span className="mt-2">
                <span className="block text-sm font-semibold leading-tight">
                  {a.label}
                </span>
                <span
                  className={cn(
                    "block text-xs leading-tight",
                    selected
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground",
                  )}
                >
                  {a.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {mode === "text" && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give it a name"
              className="h-12 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">Text</Label>
            <div className="relative">
              <Textarea
                id="content"
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste an article, notes, a chapter — anything you'd rather listen to."
                className="min-h-48 resize-none rounded-2xl pb-11 text-base leading-relaxed"
              />
              {/* Floating live stats */}
              <div className="pointer-events-none absolute inset-x-3 bottom-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/70">
                  {stats.words} {stats.words === 1 ? "word" : "words"}
                </span>
                <span aria-hidden="true">·</span>
                <span>{content.length} characters</span>
                {listenLabel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>~{listenLabel} listen</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <CreateButton
            label="Create & listen"
            loading={loading}
            onClick={handleTextSubmit}
          />
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="url">Article or page URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              type="url"
              inputMode="url"
              className="h-12 rounded-xl"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll fetch the page and extract the readable text.
            </p>
          </div>
          <CreateButton
            label="Import & listen"
            loading={loading}
            onClick={handleLinkSubmit}
          />
        </div>
      )}

      {mode === "file" && (
        <FileImport
          onError={setError}
          onDone={(id) => router.push(`/app/listen/${id}`)}
        />
      )}

      {mode === "scan" && (
        <DocumentScanner
          onError={setError}
          onDone={(id) => router.push(`/app/listen/${id}`)}
        />
      )}

      <DictationRecorder
        open={recorderOpen}
        onClose={() => setRecorderOpen(false)}
        onInsert={(text) => {
          setContent((prev) => (prev ? prev.trim() + " " + text : text))
          setMode("text")
          setError(null)
          // Let the textarea mount, then move focus to the end for quick edits.
          requestAnimationFrame(() => {
            const el = textareaRef.current
            if (el) {
              el.focus()
              el.setSelectionRange(el.value.length, el.value.length)
            }
          })
        }}
      />
    </div>
  )
}

/**
 * Primary call-to-action with a built-in busy state. Disabling while loading
 * prevents duplicate submissions, and the indeterminate bar communicates
 * progress while the document is created server-side.
 */
function CreateButton({
  label,
  loading,
  onClick,
}: {
  label: string
  loading: boolean
  onClick: () => void
}) {
  return (
    <div className="space-y-2">
      <Button
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        className="h-14 w-full rounded-2xl text-base font-semibold shadow-sm transition-transform active:scale-[0.99]"
        size="lg"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Creating…
          </>
        ) : (
          label
        )}
      </Button>
      {loading && (
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Creating your audio"
        >
          <div className="voxyfi-indeterminate h-full w-1/3 rounded-full bg-primary" />
        </div>
      )}
    </div>
  )
}

function FileImport({
  onError,
  onDone,
}: {
  onError: (msg: string) => void
  onDone: (id: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      onError("File is too large. Please use a file under 15MB.")
      return
    }
    setFileName(file.name)
    setUploading(true)
    onError("")
    haptic("light")
    try {
      // Binary formats (PDF/DOCX/EPUB) must be parsed server-side, so we send
      // the raw file to the upload endpoint which extracts the text.
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body,
      })
      const data = (await res.json()) as { id?: number; error?: string }
      if (!res.ok || !data.id) {
        onError(data.error ?? "Could not process that file.")
        setUploading(false)
        return
      }
      // Automatically generate the branded first-page thumbnail from the PDF
      // the user just uploaded, so the library grid and OG share card have a
      // real preview immediately. Best-effort and bounded (no-op for non-PDFs).
      await generateUploadThumbnail(data.id, file)
      haptic("success")
      onDone(data.id)
    } catch {
      onError("Upload failed. Please try again.")
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card px-6 py-14 text-center transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-70"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {uploading ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <FolderOpen className="h-7 w-7" />
          )}
        </span>
        <span className="font-semibold">
          {uploading
            ? `Processing ${fileName ?? "file"}…`
            : (fileName ?? "Choose a document")}
        </span>
        <span className="max-w-xs text-xs text-muted-foreground text-pretty">
          Supports PDF, DOCX, EPUB, TXT, MD, and image scans (up to 15MB)
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown,.pdf,.docx,.epub,.png,.jpg,.jpeg,.webp,.gif,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/epub+zip,image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}
