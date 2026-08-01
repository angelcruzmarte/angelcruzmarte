"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Camera,
  ImagePlus,
  Loader2,
  RotateCcw,
  ScanLine,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  acquireStream,
  hasLiveStream,
  isPermissionGranted,
  releaseStream,
} from "@/lib/media-streams"
import { cn } from "@/lib/utils"

type Page = {
  id: string
  /** Object URL for the thumbnail preview. */
  url: string
  blob: Blob
}

type CameraState = "idle" | "starting" | "live" | "denied" | "unsupported"

/**
 * Full document scanner: live camera capture plus photo upload, with multi-page
 * management. Captured/added pages are OCR'd server-side into a single document
 * which then opens in the player.
 */
export function DocumentScanner({
  onError,
  onDone,
}: {
  onError: (msg: string) => void
  onDone: (id: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraState, setCameraState] = useState<CameraState>("idle")
  const [pages, setPages] = useState<Page[]>([])
  const [processing, setProcessing] = useState(false)

  // Detach and fully release the camera (turns the OS indicator off). Kept pure
  // so it is safe to use as an unmount cleanup.
  const stopCamera = useCallback(() => {
    releaseStream("camera")
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // Explicit user close (the X button): release, then return to the idle screen.
  const closeCamera = useCallback(() => {
    stopCamera()
    setCameraState("idle")
  }, [stopCamera])

  const startCamera = useCallback(async () => {
    onError("")
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setCameraState("unsupported")
      return
    }
    setCameraState("starting")
    try {
      // Reuse the session's live camera stream when present; otherwise acquire
      // it once. No custom permission dialog — the browser prompts natively the
      // first time, and returns instantly once permission is granted.
      const stream = await acquireStream("camera")
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraState("live")
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ""
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraState("denied")
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraState("unsupported")
      } else {
        setCameraState("unsupported")
      }
    }
  }, [onError])

  // Always release the camera when leaving the scanner.
  useEffect(() => stopCamera, [stopCamera])

  // Instant launch: the user already tapped "Scan" to get here, so open the
  // camera automatically when permission is already granted (or a live stream
  // is cached from earlier this session) — no extra "Start camera" tap and no
  // custom dialog. When permission still needs prompting we keep the explicit
  // button, so the native prompt fires inside a user gesture (Safari requires
  // this for the first request).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (hasLiveStream("camera") || (await isPermissionGranted("camera"))) {
        if (!cancelled) void startCamera()
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Revoke object URLs when pages are removed / on unmount.
  useEffect(() => {
    return () => {
      pages.forEach((p) => URL.revokeObjectURL(p.url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function addBlob(blob: Blob) {
    const page: Page = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: URL.createObjectURL(blob),
      blob,
    }
    setPages((prev) => [...prev, page])
  }

  function capture() {
    const video = videoRef.current
    if (!video || cameraState !== "live") return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return
    const canvas = document.createElement("canvas")
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    canvas.toBlob(
      (blob) => {
        if (blob) addBlob(blob)
      },
      "image/jpeg",
      0.92,
    )
  }

  function removePage(id: string) {
    setPages((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.url)
      return prev.filter((p) => p.id !== id)
    })
  }

  function handleFiles(files: FileList | null) {
    if (!files) return
    onError("")
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) addBlob(file)
    })
  }

  async function extract() {
    if (pages.length === 0) return
    setProcessing(true)
    onError("")
    stopCamera()
    try {
      const body = new FormData()
      pages.forEach((p, i) => {
        body.append("pages", p.blob, `page-${i + 1}.jpg`)
      })
      const res = await fetch("/api/documents/scan", {
        method: "POST",
        body,
      })
      const data = (await res.json()) as { id?: number; error?: string }
      if (!res.ok || !data.id) {
        onError(data.error ?? "Could not read those pages.")
        setProcessing(false)
        return
      }
      onDone(data.id)
    } catch {
      onError("Scan failed. Please try again.")
      setProcessing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Camera viewport */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-neutral-900">
        {/* Video is always mounted so the ref is available; overlays cover it
            until the camera is live. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn(
            "h-full w-full object-cover",
            cameraState === "live" ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Framing guides while live */}
        {cameraState === "live" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-5 rounded-xl border-2 border-dashed border-white/70"
          />
        )}

        {cameraState !== "live" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            {cameraState === "starting" ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm font-medium">Starting camera…</p>
              </>
            ) : cameraState === "denied" ? (
              <>
                <Camera className="h-8 w-8 opacity-80" />
                <p className="text-sm font-medium">Camera access blocked</p>
                <p className="max-w-xs text-xs text-white/70">
                  Allow camera access in your browser settings, or add pages
                  from your photos instead.
                </p>
              </>
            ) : cameraState === "unsupported" ? (
              <>
                <Camera className="h-8 w-8 opacity-80" />
                <p className="text-sm font-medium">Camera unavailable</p>
                <p className="max-w-xs text-xs text-white/70">
                  We couldn&apos;t open a camera on this device. You can still
                  add pages from your photos below.
                </p>
              </>
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <ScanLine className="h-7 w-7" />
                </span>
                <p className="text-base font-semibold">Scan a document</p>
                <p className="max-w-xs text-xs text-white/70">
                  Point your camera at a page and capture it. Add as many pages
                  as you need, then extract the text.
                </p>
                <Button
                  type="button"
                  onClick={startCamera}
                  className="mt-1"
                  size="sm"
                >
                  <Camera className="h-4 w-4" />
                  Start camera
                </Button>
              </>
            )}
          </div>
        )}

        {/* Shutter while live */}
        {cameraState === "live" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/60 to-transparent p-4">
            <button
              type="button"
              onClick={closeCamera}
              aria-label="Close camera"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={capture}
              aria-label="Capture page"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 backdrop-blur transition-transform active:scale-95"
            >
              <span className="h-11 w-11 rounded-full bg-white" />
            </button>
            <span className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Secondary actions */}
      <div className="flex flex-wrap gap-2">
        {cameraState !== "live" && cameraState !== "starting" && (
          <Button
            type="button"
            variant="secondary"
            onClick={startCamera}
            className="flex-1"
          >
            <Camera className="h-4 w-4" />
            {cameraState === "idle" ? "Open camera" : "Retry camera"}
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1"
        >
          <ImagePlus className="h-4 w-4" />
          Add from photos
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {/* Captured pages */}
      {pages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {pages.length} {pages.length === 1 ? "page" : "pages"}
            </p>
            <button
              type="button"
              onClick={() => {
                pages.forEach((p) => URL.revokeObjectURL(p.url))
                setPages([])
              }}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear all
            </button>
          </div>
          <ul className="flex gap-3 overflow-x-auto pb-1">
            {pages.map((p, i) => (
              <li key={p.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url || "/placeholder.svg"}
                  alt={`Captured page ${i + 1}`}
                  className="h-28 w-20 rounded-lg border border-border object-cover"
                />
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removePage(p.id)}
                  aria-label={`Remove page ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Extract */}
      <Button
        type="button"
        onClick={extract}
        disabled={pages.length === 0 || processing}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading {pages.length} {pages.length === 1 ? "page" : "pages"}…
          </>
        ) : (
          <>
            <ScanLine className="h-4 w-4" />
            Extract text &amp; listen
          </>
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        We use on-device camera capture and read the text from your pages to
        create a listenable document.
      </p>
    </div>
  )
}
