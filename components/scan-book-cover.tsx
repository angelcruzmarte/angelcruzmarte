"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Camera, ImagePlus, Loader2, ScanLine, X } from "lucide-react"

import { recognizeBookCover, type ScanMatch } from "@/app/actions/scan-book"
import { ScanResultSheet } from "@/components/scan-result-sheet"
import { Button } from "@/components/ui/button"
import {
  acquireStream,
  hasLiveStream,
  isPermissionGranted,
  markKindUsed,
  releaseUnlessWarm,
} from "@/lib/media-streams"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

type CameraState = "idle" | "starting" | "live" | "denied" | "unsupported"
type Phase = "capture" | "identifying" | "result"

/** Longest edge (px) of the photo we send for recognition — small = fast. */
const MAX_EDGE = 1024

/** Draws the source onto a downscaled JPEG data URL for a compact upload. */
function toScaledDataUrl(source: HTMLVideoElement | HTMLImageElement, w: number, h: number) {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.8)
}

/**
 * Scan Book Cover: point the camera at a book cover (or pick a photo), and the
 * AI identifies the title so the reader can view details, add it to their
 * library, wishlist it, shop it on Amazon, or import their own file. Reuses the
 * app's warm-stream camera helpers so reopening is instant and the OS camera
 * indicator is always released when leaving.
 */
export function ScanBookCover() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [cameraState, setCameraState] = useState<CameraState>("idle")
  const [phase, setPhase] = useState<Phase>("capture")
  const [match, setMatch] = useState<ScanMatch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const stopCamera = useCallback(() => {
    releaseUnlessWarm("camera")
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraState("unsupported")
      return
    }
    setCameraState("starting")
    try {
      const stream = await acquireStream("camera")
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setCameraState("live")
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ""
      setCameraState(
        name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unsupported",
      )
    }
  }, [])

  // Always release the camera when leaving the scanner.
  useEffect(() => stopCamera, [stopCamera])

  // Auto-open the camera when permission is already granted / a stream is warm,
  // so there's no extra tap. The native prompt otherwise fires from the button
  // (inside a user gesture, which Safari requires for the first request).
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

  const runRecognition = useCallback(async (dataUrl: string) => {
    setPreview(dataUrl)
    setPhase("identifying")
    setError(null)
    haptic("light")
    try {
      const res = await recognizeBookCover(dataUrl)
      if ("error" in res) {
        setError(res.error)
        setPhase("capture")
        haptic("error")
        return
      }
      setMatch(res.match)
      setPhase("result")
      haptic("success")
    } catch {
      setError("Scan failed. Please try again.")
      setPhase("capture")
      haptic("error")
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video || cameraState !== "live") return
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return
    const dataUrl = toScaledDataUrl(video, w, h)
    if (!dataUrl) return
    markKindUsed("camera")
    stopCamera()
    setCameraState("idle")
    void runRecognition(dataUrl)
  }

  function handleFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return
    setError(null)
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const dataUrl = toScaledDataUrl(img, img.naturalWidth, img.naturalHeight)
      URL.revokeObjectURL(img.src)
      if (dataUrl) void runRecognition(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      setError("We couldn't read that image. Please try another.")
    }
    img.src = URL.createObjectURL(file)
  }

  function scanAgain() {
    setMatch(null)
    setPreview(null)
    setError(null)
    setPhase("capture")
    void startCamera()
  }

  if (phase === "result" && match) {
    return <ScanResultSheet match={match} onScanAgain={scanAgain} />
  }

  return (
    <div className="space-y-4">
      {/* Camera / preview viewport */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border bg-neutral-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn(
            "h-full w-full object-cover",
            cameraState === "live" && phase === "capture" ? "opacity-100" : "opacity-0",
          )}
        />

        {/* Framing guide while live */}
        {cameraState === "live" && phase === "capture" && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-6 rounded-xl border-2 border-dashed border-white/70"
          />
        )}

        {/* Identifying overlay (with the captured frame behind it) */}
        {phase === "identifying" && (
          <div className="absolute inset-0">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview || "/placeholder.svg"}
                alt="Captured book cover"
                className="h-full w-full object-cover opacity-40"
              />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 text-white">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium">Identifying book…</p>
            </div>
          </div>
        )}

        {/* Idle / permission states */}
        {phase === "capture" && cameraState !== "live" && (
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
                  Allow camera access in your browser settings, or pick a photo
                  of the cover instead.
                </p>
              </>
            ) : cameraState === "unsupported" ? (
              <>
                <Camera className="h-8 w-8 opacity-80" />
                <p className="text-sm font-medium">Camera unavailable</p>
                <p className="max-w-xs text-xs text-white/70">
                  We couldn&apos;t open a camera here. You can still pick a photo
                  of the cover below.
                </p>
              </>
            ) : (
              <>
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <ScanLine className="h-7 w-7" />
                </span>
                <p className="text-base font-semibold">Scan a book cover</p>
                <p className="max-w-xs text-xs text-white/70">
                  Point your camera at the front cover and capture it — we&apos;ll
                  identify the book for you.
                </p>
                <Button type="button" onClick={startCamera} className="mt-1" size="sm">
                  <Camera className="h-4 w-4" />
                  Start camera
                </Button>
              </>
            )}
          </div>
        )}

        {/* Shutter while live */}
        {cameraState === "live" && phase === "capture" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-6 bg-gradient-to-t from-black/60 to-transparent p-4">
            <button
              type="button"
              onClick={() => {
                stopCamera()
                setCameraState("idle")
              }}
              aria-label="Close camera"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25"
            >
              <X className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={capture}
              aria-label="Capture book cover"
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/20 backdrop-blur transition-transform active:scale-95"
            >
              <span className="h-11 w-11 rounded-full bg-white" />
            </button>
            <span className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      {/* Secondary actions */}
      {phase !== "identifying" && (
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
            Choose a photo
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = ""
            }}
          />
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground">
        We identify the book from your photo and never store the image.
      </p>
    </div>
  )
}
