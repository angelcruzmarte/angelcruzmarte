"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, Loader2, Square, Sparkles } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { chunkText } from "@/lib/chunk-text"
import { generatePremiumSpeech } from "@/app/actions/speech"
import { PREMIUM_VOICES } from "@/lib/voices"

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]

function base64ToUrl(base64: string, mediaType: string) {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i)
  }
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }))
}

export function PremiumNarration({ text }: { text: string }) {
  const chunks = useMemo(() => chunkText(text), [text])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache of generated object URLs keyed by `${voice}:${chunkIndex}`.
  const cacheRef = useRef<Map<string, string>>(new Map())

  const [voice, setVoice] = useState<string>(PREMIUM_VOICES[0].id)
  const [rate, setRate] = useState(1)
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">(
    "idle",
  )
  const [error, setError] = useState<string | null>(null)

  // Reset everything when the voice changes (cached audio is voice-specific).
  useEffect(() => {
    return () => {
      cacheRef.current.forEach((url) => URL.revokeObjectURL(url))
      cacheRef.current.clear()
    }
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setStatus("idle")
    setIndex(0)
  }, [])

  const loadChunk = useCallback(
    async (i: number): Promise<string | null> => {
      const key = `${voice}:${i}`
      const cached = cacheRef.current.get(key)
      if (cached) return cached
      const res = await generatePremiumSpeech(chunks[i], voice)
      if ("error" in res) {
        setError(res.error)
        return null
      }
      const url = base64ToUrl(res.audio, res.mediaType)
      cacheRef.current.set(key, url)
      return url
    },
    [chunks, voice],
  )

  const playChunk = useCallback(
    async (i: number) => {
      if (i >= chunks.length) {
        setStatus("idle")
        setIndex(0)
        return
      }
      setError(null)
      setStatus("loading")
      setIndex(i)
      const url = await loadChunk(i)
      if (!url) {
        setStatus("idle")
        return
      }
      const audio = audioRef.current
      if (!audio) return
      audio.src = url
      audio.playbackRate = rate
      try {
        await audio.play()
        setStatus("playing")
        // Prefetch the next chunk in the background for seamless playback.
        if (i + 1 < chunks.length) void loadChunk(i + 1)
      } catch {
        setStatus("paused")
      }
    },
    [chunks.length, loadChunk, rate],
  )

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (status === "playing") {
      audio.pause()
      setStatus("paused")
    } else if (status === "paused") {
      void audio.play()
      setStatus("playing")
    } else {
      void playChunk(index)
    }
  }, [status, index, playChunk])

  const handleEnded = useCallback(() => {
    void playChunk(index + 1)
  }, [index, playChunk])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  const progress =
    chunks.length > 0 ? Math.round((index / chunks.length) * 100) : 0

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} onEnded={handleEnded} className="hidden" />

      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="h-4 w-4" />
        Premium AI narration
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={handlePlayPause}
          size="lg"
          className="h-12 w-12 rounded-full p-0"
          aria-label={status === "playing" ? "Pause" : "Play"}
        >
          {status === "loading" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : status === "playing" ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5" />
          )}
        </Button>

        <Button
          onClick={stop}
          variant="secondary"
          size="lg"
          className="h-12 w-12 rounded-full p-0"
          aria-label="Stop"
          disabled={status === "idle"}
        >
          <Square className="h-4 w-4" />
        </Button>

        <div className="min-w-[120px] flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Section {Math.min(index + 1, chunks.length)} of {chunks.length}
          </p>
        </div>

        <Select value={voice} onValueChange={(v) => setVoice((v as string) ?? PREMIUM_VOICES[0].id)}>
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PREMIUM_VOICES.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "h-9 gap-1.5 px-3 tabular-nums",
            )}
          >
            {rate}x
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {RATES.map((r) => (
              <DropdownMenuItem key={r} onClick={() => setRate(r)}>
                {r}x
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Studio-quality voices generated on demand. Changing the voice re-generates
        audio for each section.
      </p>
    </div>
  )
}
