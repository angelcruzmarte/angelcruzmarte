"use client"

import { useCallback, useRef, useState } from "react"
import { Download, Loader2, Share2 } from "lucide-react"
import { generatePodcastAudio } from "@/app/actions/speech"
import { Button } from "@/components/ui/button"

type Segment = { speaker: string; line: string }

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

function fileNameFor(title: string): string {
  const slug = (title || "podcast")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${slug || "podcast"}.mp3`
}

/**
 * Download + Share controls for an AI podcast. Stitches every Host/Guest
 * segment into a single MP3 on the server, then either saves it locally or
 * hands the actual audio file to the native share sheet (Web Share API level
 * 2). Falls back to a download when file sharing isn't supported.
 */
export function PodcastAudioActions({
  segments,
  hostVoice,
  guestVoice,
  title,
}: {
  segments: Segment[]
  hostVoice: string
  guestVoice: string
  title: string
}) {
  const [busy, setBusy] = useState<"download" | "share" | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Cache the generated file so a Download followed by Share (or vice versa)
  // doesn't re-synthesize. Invalidated whenever the voice pairing changes.
  const cacheRef = useRef<{ key: string; blob: Blob } | null>(null)

  const buildBlob = useCallback(async (): Promise<Blob> => {
    // Fingerprint the voices AND the script so regenerating the podcast (new
    // segments) invalidates a previously cached file.
    const key = `${hostVoice}:${guestVoice}:${segments.length}:${
      segments[0]?.line ?? ""
    }:${segments[segments.length - 1]?.line ?? ""}`
    if (cacheRef.current?.key === key) return cacheRef.current.blob
    const res = await generatePodcastAudio(segments, hostVoice, guestVoice)
    if ("error" in res) throw new Error(res.error)
    const blob = base64ToBlob(res.audio, res.mediaType)
    cacheRef.current = { key, blob }
    return blob
  }, [segments, hostVoice, guestVoice])

  const handleDownload = useCallback(async () => {
    if (busy) return
    setBusy("download")
    setError(null)
    try {
      const blob = await buildBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileNameFor(title)
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare the audio.")
    } finally {
      setBusy(null)
    }
  }, [busy, buildBlob, title])

  const handleShare = useCallback(async () => {
    if (busy) return
    setBusy("share")
    setError(null)
    try {
      const blob = await buildBlob()
      const file = new File([blob], fileNameFor(title), { type: "audio/mpeg" })
      const nav = navigator as Navigator & {
        canShare?: (data?: ShareData) => boolean
      }
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        await nav.share({ files: [file], title: title || "Podcast" })
      } else {
        // No file-share support (most desktops): save the file instead.
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = fileNameFor(title)
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (e) {
      // The user dismissing the native share sheet throws AbortError — ignore.
      if (e instanceof DOMException && e.name === "AbortError") {
        setBusy(null)
        return
      }
      setError(e instanceof Error ? e.message : "Could not share the audio.")
    } finally {
      setBusy(null)
    }
  }, [busy, buildBlob, title])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownload}
          disabled={busy !== null}
          className="gap-1.5"
        >
          {busy === "download" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleShare}
          disabled={busy !== null}
          className="gap-1.5"
        >
          {busy === "share" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          Share
        </Button>
      </div>
      {busy && (
        <p className="text-xs text-muted-foreground">Preparing audio file…</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
