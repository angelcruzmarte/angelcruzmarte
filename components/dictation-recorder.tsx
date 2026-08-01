"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, Loader2, Mic, RotateCcw, Square, X } from "lucide-react"
import {
  extForMime,
  useAudioRecorder,
} from "@/hooks/use-audio-recorder"
import { countWords } from "@/lib/reading-time"
import { haptic } from "@/lib/haptics"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type Phase = "ready" | "recording" | "processing" | "review" | "error"

const BAR_COUNT = 40

function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

/**
 * Full-screen dictation experience. Wraps the cross-browser audio recorder and
 * the ElevenLabs transcription API into a focused, one-handed mobile flow:
 * ready → recording → processing → review → insert. Errors are recoverable
 * with a retry. The mic permission is only requested when the user taps record.
 */
export function DictationRecorder({
  open,
  onClose,
  onInsert,
}: {
  open: boolean
  onClose: () => void
  onInsert: (text: string) => void
}) {
  const [phase, setPhase] = useState<Phase>("ready")
  const [transcript, setTranscript] = useState("")
  const [errorMsg, setErrorMsg] = useState("")

  const barsRef = useRef<Array<HTMLSpanElement | null>>([])
  const rafRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const handleComplete = useCallback(async (blob: Blob, mime: string) => {
    setPhase("processing")
    haptic("medium")
    try {
      const body = new FormData()
      body.append("audio", blob, `dictation.${extForMime(mime)}`)
      const res = await fetch("/api/transcribe", { method: "POST", body })
      const data = (await res
        .json()
        .catch(() => ({}))) as { text?: string; error?: string }
      if (!res.ok || !data.text) {
        // Give the accurate reason rather than a blanket "transcription failed":
        // an expired session (401) is an auth problem, not an audio problem.
        const message =
          res.status === 401
            ? "Your session expired. Please sign in again, then retry."
            : (data.error ??
              "Couldn't transcribe that audio. Please try again.")
        setErrorMsg(message)
        setPhase("error")
        haptic("error")
        return
      }
      setTranscript(data.text)
      setPhase("review")
      haptic("success")
    } catch {
      setErrorMsg("Couldn't transcribe that audio. Please check your connection.")
      setPhase("error")
      haptic("error")
    }
  }, [])

  const handleError = useCallback((message: string) => {
    setErrorMsg(message)
    setPhase("error")
    haptic("warning")
  }, [])

  const recorder = useAudioRecorder({
    onComplete: handleComplete,
    onError: handleError,
  })
  const { analyser, elapsedMs, start, stop, cancel } = recorder

  analyserRef.current = analyser

  // Reset to a clean slate whenever the sheet opens.
  useEffect(() => {
    if (open) {
      setPhase("ready")
      setTranscript("")
      setErrorMsg("")
    }
  }, [open])

  // Lock background scroll while the full-screen recorder is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // Drive the live waveform from the analyser. We mutate bar heights directly
  // (no React re-render per frame) for smoothness, and skip animation entirely
  // when the user prefers reduced motion.
  useEffect(() => {
    if (phase !== "recording") return
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    const node = analyserRef.current
    if (!node) return

    const data = new Uint8Array(node.frequencyBinCount)

    if (prefersReduced) {
      // Static, honest indicator: a gentle midline, no motion.
      barsRef.current.forEach((bar) => {
        if (bar) bar.style.transform = "scaleY(0.25)"
      })
      return
    }

    const draw = () => {
      node.getByteFrequencyData(data)
      const step = Math.floor(data.length / BAR_COUNT) || 1
      for (let i = 0; i < BAR_COUNT; i++) {
        const v = data[i * step] / 255 // 0..1
        const scale = Math.max(0.08, v)
        const bar = barsRef.current[i]
        if (bar) bar.style.transform = `scaleY(${scale.toFixed(3)})`
      }
      rafRef.current = requestAnimationFrame(draw)
    }
    rafRef.current = requestAnimationFrame(draw)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [phase])

  // Keep the local phase in sync when recording actually begins.
  useEffect(() => {
    if (recorder.status === "recording") setPhase("recording")
  }, [recorder.status])

  const handleClose = useCallback(() => {
    if (recorder.status === "recording") cancel()
    onClose()
  }, [recorder.status, cancel, onClose])

  // Escape closes the sheet unless we're mid-recording (avoid losing audio).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "recording" && phase !== "processing") {
        handleClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, phase, handleClose])

  if (!open) return null

  function handleStart() {
    haptic("light")
    setErrorMsg("")
    void start()
  }

  function handleStop() {
    haptic("medium")
    stop()
  }

  function handleStartOver() {
    haptic("light")
    setTranscript("")
    setErrorMsg("")
    setPhase("ready")
  }

  function handleInsert() {
    const text = transcript.trim()
    if (!text) return
    haptic("success")
    onInsert(text)
    onClose()
  }

  const statusLabel =
    phase === "ready"
      ? "Ready to record"
      : phase === "recording"
        ? "Recording"
        : phase === "processing"
          ? "Transcribing your audio"
          : phase === "review"
            ? "Review your transcription"
            : "Something went wrong"

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dictate text"
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleClose}
          aria-label="Cancel dictation"
          className="h-11 w-11 rounded-full"
        >
          <X className="h-5 w-5" />
        </Button>
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {statusLabel}
        </p>
        <div className="h-11 w-11" aria-hidden="true" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-8">
        {(phase === "ready" || phase === "recording") && (
          <>
            {/* Timer */}
            <div
              className={cn(
                "font-mono text-6xl font-bold tabular-nums tracking-tight transition-colors",
                phase === "recording" ? "text-foreground" : "text-muted-foreground/40",
              )}
              aria-live="off"
            >
              {formatClock(phase === "recording" ? elapsedMs : 0)}
            </div>

            {/* Waveform */}
            <div
              className="flex h-24 w-full max-w-sm items-center justify-center gap-[3px]"
              aria-hidden="true"
            >
              {Array.from({ length: BAR_COUNT }).map((_, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    barsRef.current[i] = el
                  }}
                  className={cn(
                    "h-full w-full origin-center rounded-full transition-[background-color]",
                    phase === "recording" ? "bg-primary" : "bg-muted",
                  )}
                  style={{ transform: "scaleY(0.08)" }}
                />
              ))}
            </div>

            {/* Big mic / stop control */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={phase === "recording" ? handleStop : handleStart}
                aria-label={phase === "recording" ? "Stop recording" : "Start recording"}
                className={cn(
                  "relative flex h-24 w-24 items-center justify-center rounded-full text-primary-foreground shadow-lg outline-none transition-transform focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-95",
                  phase === "recording"
                    ? "bg-destructive"
                    : "bg-primary hover:bg-primary/90",
                )}
              >
                {phase === "recording" && (
                  <span className="voxyfi-mic-pulse absolute inset-0 rounded-full bg-destructive/40" />
                )}
                {phase === "recording" ? (
                  <Square className="relative h-8 w-8 fill-current" />
                ) : (
                  <Mic className="relative h-9 w-9" />
                )}
              </button>
              <p className="text-sm text-muted-foreground">
                {phase === "recording" ? "Tap to stop" : "Tap to start recording"}
              </p>
            </div>
          </>
        )}

        {phase === "processing" && (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">Transcribing…</p>
              <p className="text-sm text-muted-foreground">
                Turning your voice into text.
              </p>
            </div>
          </div>
        )}

        {phase === "review" && (
          <div className="flex w-full max-w-md flex-1 flex-col gap-4 pt-4">
            <div className="flex items-center gap-2 text-primary">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Check className="h-5 w-5" />
              </span>
              <p className="font-semibold">Transcription ready</p>
            </div>
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              aria-label="Review and edit transcription"
              className="min-h-40 flex-1 resize-none rounded-2xl text-base leading-relaxed"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {countWords(transcript)} words · edit before inserting if needed
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="flex max-w-sm flex-col items-center gap-5 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
              <Mic className="h-9 w-9 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">Recording failed</p>
              <p className="text-sm text-muted-foreground text-pretty">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        {phase === "review" && (
          <div className="mx-auto flex max-w-md flex-col gap-3">
            <Button
              type="button"
              size="lg"
              className="h-14 w-full rounded-2xl text-base"
              onClick={handleInsert}
              disabled={!transcript.trim()}
            >
              Insert text
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 w-full rounded-2xl"
              onClick={handleStartOver}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Start over
            </Button>
          </div>
        )}

        {phase === "error" && (
          <div className="mx-auto flex max-w-md flex-col gap-3">
            <Button
              type="button"
              size="lg"
              className="h-14 w-full rounded-2xl text-base"
              onClick={handleStartOver}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Try again
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 w-full rounded-2xl"
              onClick={handleClose}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
