"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FolderOpen,
  LinkIcon,
  Loader2,
  Mic,
  ScanLine,
  Square,
  Type,
} from "lucide-react"
import { createDocument, importFromUrl } from "@/app/actions/documents"
import { DocumentScanner } from "@/components/document-scanner"
import { generateUploadThumbnail } from "@/lib/document-artwork"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Mode = "text" | "link" | "file" | "dictate" | "scan"

const modes: { id: Mode; label: string; icon: React.ElementType }[] = [
  { id: "text", label: "Type or Paste", icon: Type },
  { id: "scan", label: "Scan", icon: ScanLine },
  { id: "link", label: "Link", icon: LinkIcon },
  { id: "file", label: "File", icon: FolderOpen },
  { id: "dictate", label: "Dictate", icon: Mic },
]

export function AddContent({ initialMode = "text" }: { initialMode?: Mode }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(promise: Promise<{ id: number }>) {
    setLoading(true)
    setError(null)
    try {
      const doc = await promise
      router.push(`/app/listen/${doc.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
      setLoading(false)
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

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Add content</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Turn anything into audio you can listen to.
      </p>

      <div className="mb-5 flex flex-wrap gap-2">
        {modes.map((m) => {
          const Icon = m.icon
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMode(m.id)
                setError(null)
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-secondary text-foreground hover:bg-accent",
              )}
            >
              <Icon className="h-4 w-4" />
              {m.label}
            </button>
          )
        })}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {(mode === "text" || mode === "dictate") && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give it a name"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">Text</Label>
              {mode === "dictate" && (
                <DictateButton
                  onText={(t) =>
                    setContent((prev) => (prev ? prev + " " + t : t))
                  }
                  onError={setError}
                />
              )}
            </div>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={
                mode === "dictate"
                  ? "Tap the mic and start speaking, or type here…"
                  : "Paste or type the text you want to listen to…"
              }
              rows={10}
            />
            <p className="text-xs text-muted-foreground">
              {content.trim() ? content.trim().split(/\s+/).length : 0} words
            </p>
          </div>
          <Button
            onClick={handleTextSubmit}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Create & listen"
            )}
          </Button>
        </div>
      )}

      {mode === "link" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="url">Article or page URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/article"
              type="url"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll fetch the page and extract the readable text.
            </p>
          </div>
          <Button
            onClick={handleLinkSubmit}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Import & listen"
            )}
          </Button>
        </div>
      )}

      {mode === "file" && (
        <FileImport onError={setError} onDone={(id) => router.push(`/app/listen/${id}`)} />
      )}

      {mode === "scan" && (
        <DocumentScanner
          onError={setError}
          onDone={(id) => router.push(`/app/listen/${id}`)}
        />
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
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-secondary/50 px-6 py-12 text-center transition-colors hover:bg-secondary"
      >
        {uploading ? (
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        ) : (
          <FolderOpen className="h-7 w-7 text-muted-foreground" />
        )}
        <span className="font-medium">
          {uploading
            ? `Processing ${fileName ?? "file"}…`
            : (fileName ?? "Choose a document")}
        </span>
        <span className="text-xs text-muted-foreground">
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

/** Pick an audio container MediaRecorder actually supports on this browser. */
function pickAudioMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined
  }
  // Chrome/Firefox/Android prefer webm/opus; iOS Safari records mp4/aac. Try
  // them in order and let the browser fall back to its default if none match.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

/** Map a MediaRecorder mime type to a file extension for the upload. */
function extForMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4"
  if (mime.includes("aac")) return "aac"
  return "webm"
}

type DictateState = "idle" | "recording" | "transcribing"

/**
 * Records a short mic clip with MediaRecorder and transcribes it server-side
 * via ElevenLabs Scribe (see /api/transcribe). This replaces the old
 * `webkitSpeechRecognition` implementation, which never activated the mic in
 * iOS Safari or the App Store WKWebView. getUserMedia + MediaRecorder are
 * supported across those targets and trigger the native mic-permission prompt.
 */
function DictateButton({
  onText,
  onError,
}: {
  onText: (text: string) => void
  onError: (msg: string) => void
}) {
  const [state, setState] = useState<DictateState>("idle")
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeRef = useRef<string>("audio/webm")

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  // Release the mic if the component unmounts while recording.
  useEffect(() => {
    return () => {
      try {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop()
        }
      } catch {
        // Recorder may already be inactive; ignore.
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  async function transcribe(blob: Blob) {
    setState("transcribing")
    try {
      const body = new FormData()
      const ext = extForMime(mimeRef.current)
      body.append("audio", blob, `dictation.${ext}`)
      const res = await fetch("/api/transcribe", { method: "POST", body })
      const data = (await res.json()) as { text?: string; error?: string }
      if (!res.ok || !data.text) {
        onError(data.error ?? "Couldn't transcribe that audio. Please try again.")
      } else {
        onText(data.text)
      }
    } catch {
      onError("Couldn't transcribe that audio. Please check your connection.")
    } finally {
      setState("idle")
    }
  }

  async function start() {
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("Dictation isn't supported in this browser. Try typing instead.")
      return
    }
    onError("")
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      // NotAllowedError = permission denied; NotFoundError = no mic.
      const name = err instanceof DOMException ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        onError("Microphone access was denied. Enable it in your browser settings.")
      } else if (name === "NotFoundError") {
        onError("No microphone was found on this device.")
      } else {
        onError("Couldn't start the microphone. Please try again.")
      }
      return
    }

    streamRef.current = stream
    const mimeType = pickAudioMimeType()
    mimeRef.current = mimeType ?? "audio/webm"
    chunksRef.current = []
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    )
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      stopStream()
      const blob = new Blob(chunksRef.current, { type: mimeRef.current })
      if (blob.size === 0) {
        setState("idle")
        onError("No audio was recorded. Please try again.")
        return
      }
      void transcribe(blob)
    }
    recorderRef.current = recorder
    recorder.start()
    setState("recording")
  }

  function stop() {
    recorderRef.current?.stop()
  }

  function toggle() {
    if (state === "recording") stop()
    else if (state === "idle") void start()
  }

  return (
    <Button
      type="button"
      size="sm"
      variant={state === "recording" ? "destructive" : "secondary"}
      onClick={toggle}
      disabled={state === "transcribing"}
      className="gap-1.5"
      aria-label={
        state === "recording"
          ? "Stop dictation"
          : state === "transcribing"
            ? "Transcribing dictation"
            : "Start dictation"
      }
    >
      {state === "recording" ? (
        <>
          <Square className="h-3.5 w-3.5" />
          Stop
        </>
      ) : state === "transcribing" ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Transcribing…
        </>
      ) : (
        <>
          <Mic className="h-3.5 w-3.5" />
          Dictate
        </>
      )}
    </Button>
  )
}
