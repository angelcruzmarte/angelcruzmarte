"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Pause, Play, Loader2, Square, Sparkles, Languages } from "lucide-react"
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
import { ReaderPanel } from "@/components/reader-panel"
import { cn } from "@/lib/utils"
import { chunkForNarration } from "@/lib/chunk-text"
import { tokenize } from "@/hooks/use-speech"
import { generatePremiumSpeech } from "@/app/actions/speech"
import { translateText } from "@/app/actions/ai"
import { PREMIUM_VOICES } from "@/lib/voices"
import { READING_LANGUAGES } from "@/lib/languages"

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]

function base64ToUrl(base64: string, mediaType: string) {
  const byteChars = atob(base64)
  const bytes = new Uint8Array(byteChars.length)
  for (let i = 0; i < byteChars.length; i++) {
    bytes[i] = byteChars.charCodeAt(i)
  }
  return URL.createObjectURL(new Blob([bytes], { type: mediaType }))
}

function countWords(s: string) {
  return s.match(/\S+/g)?.length ?? 0
}

export function PremiumNarration({
  text,
  title,
}: {
  text: string
  title: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache of generated object URLs keyed by `${lang}:${voice}:${chunkIndex}`.
  const cacheRef = useRef<Map<string, string>>(new Map())

  const [voice, setVoice] = useState<string>(PREMIUM_VOICES[0].id)
  const [rate, setRate] = useState(1)
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">(
    "idle",
  )
  const [error, setError] = useState<string | null>(null)
  const [currentWord, setCurrentWord] = useState(-1)

  // Translation state.
  const [lang, setLang] = useState<string>("en")
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState(false)
  const [truncatedNote, setTruncatedNote] = useState(false)

  const activeText = lang === "en" ? text : translations[lang] ?? text

  // Words for the reader (highlighting) and the chunks fed to the TTS model,
  // together with the cumulative word offset at which each chunk begins.
  const words = useMemo(() => tokenize(activeText), [activeText])
  const { chunks, offsets } = useMemo(() => {
    const cs = chunkForNarration(activeText)
    const offs: number[] = []
    let acc = 0
    for (const c of cs) {
      offs.push(acc)
      acc += countWords(c)
    }
    return { chunks: cs, offsets: offs }
  }, [activeText])

  // Revoke cached audio URLs on unmount.
  useEffect(() => {
    const cache = cacheRef.current
    return () => {
      cache.forEach((url) => URL.revokeObjectURL(url))
      cache.clear()
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
    setCurrentWord(-1)
  }, [])

  const loadChunk = useCallback(
    async (i: number): Promise<string | null> => {
      const key = `${lang}:${voice}:${i}`
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
    [chunks, voice, lang],
  )

  const playChunk = useCallback(
    async (i: number) => {
      if (i >= chunks.length) {
        setStatus("idle")
        setIndex(0)
        setCurrentWord(-1)
        return
      }
      setError(null)
      setStatus("loading")
      setIndex(i)
      setCurrentWord(offsets[i] ?? 0)
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
    [chunks.length, loadChunk, rate, offsets],
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

  // Approximate follow-along highlighting: map audio progress within the
  // current chunk onto its word range so the reader tracks and auto-scrolls.
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.duration || Number.isNaN(audio.duration)) return
    const frac = Math.min(1, audio.currentTime / audio.duration)
    const localCount = countWords(chunks[index] ?? "")
    const local = Math.min(localCount - 1, Math.floor(frac * localCount))
    setCurrentWord((offsets[index] ?? 0) + Math.max(0, local))
  }, [chunks, index, offsets])

  // Start playback from the chunk that contains a tapped word.
  const handleWordClick = useCallback(
    (wordIndex: number) => {
      let target = 0
      for (let i = offsets.length - 1; i >= 0; i--) {
        if (offsets[i] <= wordIndex) {
          target = i
          break
        }
      }
      void playChunk(target)
    },
    [offsets, playChunk],
  )

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  const handleVoiceChange = useCallback(
    (v: string | null) => {
      stop()
      setVoice(v || PREMIUM_VOICES[0].id)
    },
    [stop],
  )

  const handleLangChange = useCallback(
    async (value: string | null) => {
      const next = value ?? "en"
      if (next === lang) return
      stop()
      setError(null)
      setTruncatedNote(false)
      // Original or an already-translated language: switch instantly.
      if (next === "en" || translations[next]) {
        setLang(next)
        return
      }
      setTranslating(true)
      try {
        const res = await translateText(text, next)
        if (res.error) {
          setError(res.error)
          return
        }
        setTranslations((prev) => ({ ...prev, [next]: res.translated }))
        setTruncatedNote(res.truncated)
        setLang(next)
      } catch {
        setError(
          "Could not translate this text right now. Please try again shortly.",
        )
      } finally {
        setTranslating(false)
      }
    },
    [lang, translations, text, stop],
  )

  const progress =
    chunks.length > 0 ? Math.round((index / chunks.length) * 100) : 0
  const busy = status === "loading" || translating

  return (
    <>
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          className="hidden"
        />

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
            disabled={busy}
          >
            {busy ? (
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
              {translating
                ? "Translating…"
                : `Section ${Math.min(index + 1, chunks.length)} of ${chunks.length}`}
            </p>
          </div>

          <Select value={voice} onValueChange={handleVoiceChange}>
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

        {/* Language / translation control */}
        <div className="mt-3 flex items-center gap-2">
          <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Select
            value={lang}
            onValueChange={handleLangChange}
            disabled={translating}
          >
            <SelectTrigger className="h-9 w-full max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {READING_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {translating && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {truncatedNote && (
          <p className="mt-2 text-xs text-muted-foreground">
            This document is long — only the first portion was translated.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Studio-quality voices generated on demand. Playback starts quickly and
          the text follows along as it reads. Choose a language to listen in a
          translation.
        </p>
      </div>

      <ReaderPanel
        title={title}
        text={activeText}
        words={words}
        currentWord={currentWord}
        onWordClick={handleWordClick}
      />

      {/* Floating controls so the user can always pause/stop without scrolling
          back up to the card on long documents. */}
      {status !== "idle" && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md">
            <Button
              onClick={handlePlayPause}
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full"
              aria-label={status === "playing" ? "Pause" : "Play"}
              disabled={busy}
            >
              {busy ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : status === "playing" ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5" />
              )}
            </Button>

            <Button
              onClick={stop}
              variant="secondary"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-full"
              aria-label="Stop"
            >
              <Square className="h-4 w-4" />
            </Button>

            <div className="min-w-0 flex-1">
              <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">
                {status === "loading"
                  ? "Loading…"
                  : `Section ${Math.min(index + 1, chunks.length)} of ${chunks.length}`}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
