"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Cross-browser microphone recording built on getUserMedia + MediaRecorder.
 *
 * Intentionally does NOT use webkitSpeechRecognition, which is unreliable in
 * iOS Safari and absent inside the iOS WKWebView (App Store wrapper). This
 * approach works across Safari, Chrome, Edge, Firefox, Android and iOS, and
 * only prompts for the mic permission when `start()` is called (user gesture).
 *
 * It also exposes the live AnalyserNode so a visualizer can render a real
 * waveform/volume meter from the captured audio.
 */

export type RecorderStatus = "idle" | "requesting" | "recording" | "stopped"

/** Pick an audio container MediaRecorder actually supports on this browser. */
function pickAudioMimeType(): string | undefined {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof MediaRecorder.isTypeSupported !== "function"
  ) {
    return undefined
  }
  // Chrome/Firefox/Android prefer webm/opus; iOS Safari records mp4/aac.
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

/** Map a MediaRecorder mime type to a file extension for the upload. */
export function extForMime(mime: string): string {
  if (mime.includes("mp4")) return "mp4"
  if (mime.includes("aac")) return "aac"
  return "webm"
}

export interface UseAudioRecorderOptions {
  /** Called with the finished clip when the user stops (not on cancel). */
  onComplete?: (blob: Blob, mime: string) => void
  /** Called with a user-facing message when recording can't start/continue. */
  onError?: (message: string) => void
}

export interface UseAudioRecorder {
  status: RecorderStatus
  /** Elapsed recording time in milliseconds. */
  elapsedMs: number
  /** Live analyser for visualization, or null when not recording. */
  analyser: AnalyserNode | null
  /** Whether the browser can record at all. */
  supported: boolean
  start: () => Promise<void>
  /** Finalize the recording and emit the clip via onComplete. */
  stop: () => void
  /** Abort and discard the recording without emitting a clip. */
  cancel: () => void
}

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {},
): UseAudioRecorder {
  const { onComplete, onError } = options

  const [status, setStatus] = useState<RecorderStatus>("idle")
  const [elapsedMs, setElapsedMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const mimeRef = useRef<string>("audio/webm")
  const audioCtxRef = useRef<AudioContext | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef<number>(0)
  const cancelledRef = useRef<boolean>(false)

  // Keep the latest callbacks in refs so the recorder's event handlers never
  // read stale closures.
  const onCompleteRef = useRef(onComplete)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCompleteRef.current = onComplete
    onErrorRef.current = onError
  }, [onComplete, onError])

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"

  const teardown = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    setAnalyser(null)
  }, [])

  const start = useCallback(async () => {
    // getUserMedia only exists in a secure context (HTTPS or localhost). When a
    // page is served over plain HTTP, `navigator.mediaDevices` is undefined —
    // surface that precise reason instead of a vague "not supported".
    if (
      typeof window !== "undefined" &&
      window.isSecureContext === false
    ) {
      onErrorRef.current?.(
        "Recording needs a secure (HTTPS) connection. Please reload over HTTPS and try again.",
      )
      return
    }
    if (!supported) {
      onErrorRef.current?.(
        "Recording isn't supported in this browser. Try typing instead.",
      )
      return
    }
    cancelledRef.current = false
    setStatus("requesting")

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      setStatus("idle")
      const name = err instanceof DOMException ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        // Either the user denied the prompt, or a Permissions-Policy /
        // WKWebView capability is blocking the mic before any prompt appears.
        onErrorRef.current?.(
          "Microphone access is blocked. Allow the microphone for this site in your settings, then try again.",
        )
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        onErrorRef.current?.("No microphone was found on this device.")
      } else if (name === "NotReadableError" || name === "AbortError") {
        // The OS handed back the device but couldn't start it — typically
        // because another app (or tab) is already holding the microphone.
        onErrorRef.current?.(
          "Your microphone is in use by another app. Close it and try again.",
        )
      } else {
        onErrorRef.current?.("Couldn't start the microphone. Please try again.")
      }
      return
    }

    streamRef.current = stream

    // Set up the analyser for the live visualization. Best-effort: if the
    // Web Audio API isn't available the recording still works, just without viz.
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (Ctx) {
        const ctx = new Ctx()
        audioCtxRef.current = ctx
        // iOS creates AudioContexts in a "suspended" state; resume so the live
        // waveform actually animates. Best-effort — recording is unaffected.
        if (ctx.state === "suspended") void ctx.resume().catch(() => {})
        const source = ctx.createMediaStreamSource(stream)
        const node = ctx.createAnalyser()
        node.fftSize = 256
        node.smoothingTimeConstant = 0.8
        source.connect(node)
        setAnalyser(node)
      }
    } catch {
      // Visualization is optional; ignore failures.
    }

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
      const wasCancelled = cancelledRef.current
      teardown()
      setStatus(wasCancelled ? "idle" : "stopped")
      if (wasCancelled) return
      const blob = new Blob(chunksRef.current, { type: mimeRef.current })
      if (blob.size === 0) {
        onErrorRef.current?.("No audio was recorded. Please try again.")
        return
      }
      onCompleteRef.current?.(blob, mimeRef.current)
    }
    recorderRef.current = recorder
    recorder.start()

    startedAtRef.current = Date.now()
    setElapsedMs(0)
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, 100)
    setStatus("recording")
  }, [supported, teardown])

  const stop = useCallback(() => {
    cancelledRef.current = false
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop()
    }
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop()
    } else {
      teardown()
      setStatus("idle")
    }
  }, [teardown])

  // Release the mic if the consumer unmounts mid-recording.
  useEffect(() => {
    return () => {
      try {
        if (recorderRef.current?.state === "recording") {
          cancelledRef.current = true
          recorderRef.current.stop()
        }
      } catch {
        // Recorder may already be inactive; ignore.
      }
      teardown()
    }
  }, [teardown])

  return { status, elapsedMs, analyser, supported, start, stop, cancel }
}
