"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Pause,
  Play,
  Loader2,
  Square,
  Sparkles,
  Languages,
  SkipBack,
  SkipForward,
  Gauge,
  Check,
  ChevronDown,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
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
import { translatePassage } from "@/app/actions/ai"
import { PREMIUM_VOICES, getPremiumVoice } from "@/lib/voices"
import {
  normalizeLang,
  isSupportedLang,
  languageLabel,
} from "@/lib/languages"

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
// Upper bound on how many sections we pre-translate in the background. Sections
// beyond this are still translated on demand the moment they are played, so
// playback is never blocked — this only caps background work on huge documents.
const BACKGROUND_TRANSLATE_CAP = 40

function countWords(s: string) {
  return s.match(/\S+/g)?.length ?? 0
}

export function PremiumNarration({
  text,
  title,
  sourceLang,
  showReader = true,
  immersive = false,
  topSlot,
  paused = false,
  onActiveWord,
  onPlayingChange,
}: {
  text: string
  title: string
  /** Detected language of the document (BCP-47/ISO code), if known. */
  sourceLang?: string | null
  /** When false, the internal text reader is hidden (e.g. showing original). */
  showReader?: boolean
  /** Immersive mode: render only a compact, always-on docked player card. */
  immersive?: boolean
  /** Content rendered above the transport controls in immersive mode. */
  topSlot?: React.ReactNode
  /** When true, force-pause playback (e.g. an AI tool panel is open). */
  paused?: boolean
  /** Reports the approximate active word position for external follow-along. */
  onActiveWord?: (word: number, total: number) => void
  /** Reports whether audio is actively playing, for external auto-scroll. */
  onPlayingChange?: (playing: boolean) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache of persistent audio URLs keyed by `${lang}:${voice}:${chunkIndex}`.
  const cacheRef = useRef<Map<string, string>>(new Map())

  const [voice, setVoice] = useState<string>(PREMIUM_VOICES[0].id)
  const [rate, setRate] = useState(1)
  const [index, setIndex] = useState(0)
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused">(
    "idle",
  )
  const [error, setError] = useState<string | null>(null)
  const [currentWord, setCurrentWord] = useState(-1)

  // Narration sections come from the ORIGINAL text so their boundaries stay
  // stable across languages. Translations are stored per section and filled in
  // progressively, so switching language and starting playback feels instant.
  const sourceChunks = useMemo(() => chunkForNarration(text), [text])

  // Translation state. `lang` is either the sentinel "original" (narrate the
  // document as-is) or a target language code we translate INTO. There is no
  // manual language menu: we auto-detect the reader's device language and, when
  // it differs from the document's language, offer/enable translation to it.
  const ORIGINAL = "original"
  const [lang, setLang] = useState<string>(ORIGINAL)
  const [sections, setSections] = useState<
    Record<string, (string | undefined)[]>
  >({})
  const [translating, setTranslating] = useState(false)

  // Device/browser language (known only on the client). Normalized to a
  // two-letter code, e.g. "en-US" -> "en".
  const [deviceLang, setDeviceLang] = useState<string>("")
  useEffect(() => {
    setDeviceLang(normalizeLang(navigator.language))
  }, [])

  const sourceNorm = sourceLang ? normalizeLang(sourceLang) : ""
  // Translation is offered only when we know the document's language, the
  // reader's device language is one we support, and the two differ.
  const canTranslate =
    Boolean(sourceNorm) &&
    Boolean(deviceLang) &&
    isSupportedLang(deviceLang) &&
    deviceLang !== sourceNorm

  // Refs mirror state for use inside async loops without stale closures.
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections
  const langRef = useRef(lang)
  langRef.current = lang
  // Dedupe concurrent translation requests for the same section.
  const inflightRef = useRef<Map<string, Promise<string>>>(new Map())

  // Effective section text for the current language (falls back to source when
  // a section has not been translated yet).
  const chunks = useMemo(() => {
    if (lang === ORIGINAL) return sourceChunks
    const arr = sections[lang]
    return sourceChunks.map((c, i) => arr?.[i] ?? c)
  }, [lang, sourceChunks, sections])

  const activeText = useMemo(() => chunks.join("\n\n"), [chunks])

  // Words for the reader (highlighting) + cumulative word offset per section.
  const words = useMemo(() => tokenize(activeText), [activeText])
  const offsets = useMemo(() => {
    const offs: number[] = []
    let acc = 0
    for (const c of chunks) {
      offs.push(acc)
      acc += countWords(c)
    }
    return offs
  }, [chunks])

  // Surface the approximate active word so an external follow-along view (the
  // PDF pages) can track playback position. The callback is held in a ref so an
  // inline parent callback doesn't retrigger this effect every render.
  const onActiveWordRef = useRef(onActiveWord)
  onActiveWordRef.current = onActiveWord
  useEffect(() => {
    onActiveWordRef.current?.(currentWord, words.length)
  }, [currentWord, words.length])

  // Surface whether audio is actively playing so the external follow-along view
  // only auto-scrolls during playback (and never yanks the user back to the top
  // when paused/idle). Held in a ref to avoid retriggering on inline callbacks.
  const onPlayingChangeRef = useRef(onPlayingChange)
  onPlayingChangeRef.current = onPlayingChange
  useEffect(() => {
    onPlayingChangeRef.current?.(status === "playing")
  }, [status])

  // Number of sections translated so far for the current language (for the note).
  const doneCount =
    lang === ORIGINAL
      ? sourceChunks.length
      : sections[lang]?.reduce((n, s) => (s ? n + 1 : n), 0) ?? 0

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

  // Translate a single source section into `targetLang`, caching the result and
  // deduplicating in-flight requests. Returns the translated (or source) text.
  const translateSection = useCallback(
    (targetLang: string, i: number): Promise<string> => {
      if (targetLang === ORIGINAL) return Promise.resolve(sourceChunks[i])
      const existing = sectionsRef.current[targetLang]?.[i]
      if (existing) return Promise.resolve(existing)
      const key = `${targetLang}:${i}`
      const running = inflightRef.current.get(key)
      if (running) return running
      const p = (async () => {
        const t = await translatePassage(sourceChunks[i], targetLang)
        setSections((prev) => {
          const arr = prev[targetLang]
            ? prev[targetLang].slice()
            : new Array<string | undefined>(sourceChunks.length).fill(undefined)
          arr[i] = t
          return { ...prev, [targetLang]: arr }
        })
        return t
      })()
      inflightRef.current.set(key, p)
      void p.finally(() => inflightRef.current.delete(key))
      return p
    },
    [sourceChunks],
  )

  // Progressively translate sections in the background (bounded concurrency),
  // starting from `startAt` so the section about to play is ready first.
  const translateInBackground = useCallback(
    async (targetLang: string, startAt: number) => {
      if (targetLang === ORIGINAL) return
      const total = sourceChunks.length
      const order: number[] = []
      for (let i = startAt; i < total && order.length < BACKGROUND_TRANSLATE_CAP; i++) {
        order.push(i)
      }
      for (let i = 0; i < startAt && order.length < BACKGROUND_TRANSLATE_CAP; i++) {
        order.push(i)
      }
      setTranslating(true)
      let hadError = false
      let cursor = 0
      const worker = async () => {
        while (cursor < order.length) {
          const idx = order[cursor++]
          if (langRef.current !== targetLang) return // user switched away
          try {
            await translateSection(targetLang, idx)
          } catch {
            hadError = true // leave source fallback for this section
          }
        }
      }
      try {
        await Promise.all([worker(), worker()])
        if (hadError && langRef.current === targetLang) {
          setError(
            "Some sections couldn't be translated due to high demand — showing the original text for those. Playback still works.",
          )
        }
      } finally {
        if (langRef.current === targetLang) setTranslating(false)
      }
    },
    [sourceChunks, translateSection],
  )

  const loadChunk = useCallback(
    async (i: number): Promise<string | null> => {
      const key = `${lang}:${voice}:${i}`
      const cached = cacheRef.current.get(key)
      if (cached) return cached
      // Ensure this section is translated (on demand) before generating audio.
      let sectionText = sourceChunks[i]
      if (lang !== ORIGINAL) {
        try {
          sectionText = await translateSection(lang, i)
        } catch {
          setError(
            "Translation is temporarily unavailable — playing the original text for this section.",
          )
          sectionText = sourceChunks[i]
        }
      }
      const res = await generatePremiumSpeech(sectionText, voice)
      if ("error" in res) {
        setError(res.error)
        return null
      }
      // res.url is a persistent, publicly cached MP3 URL — the browser caches it
      // too, so replays are instant and never re-hit the TTS API.
      cacheRef.current.set(key, res.url)
      return res.url
    },
    [sourceChunks, voice, lang, translateSection],
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
      // Try to load audio; if the first attempt is throttled, automatically
      // retry a couple of times with a short delay so the user doesn't have to
      // press play again themselves.
      let url = await loadChunk(i)
      for (let attempt = 0; !url && attempt < 2; attempt++) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
        url = await loadChunk(i)
      }
      if (!url) {
        setStatus("idle")
        return
      }
      setError(null)
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

  // When an AI tool panel opens, force-pause narration so the two audio
  // sources don't overlap. On close (`paused` back to false) we leave playback
  // paused so the reader resumes intentionally with the Play button.
  useEffect(() => {
    if (!paused) return
    const audio = audioRef.current
    if (audio && !audio.paused) audio.pause()
    setStatus((s) => (s === "playing" || s === "loading" ? "paused" : s))
  }, [paused])

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

  // When the user switches voice, stop the current audio and — if it was
  // playing — resume the SAME section with the new voice. The actual replay
  // happens in an effect below, once `voice` (and the voice-aware `playChunk`)
  // has updated, so we don't play with a stale closure.
  const pendingResumeRef = useRef<number | null>(null)
  const handleVoiceChange = useCallback(
    (v: string | null) => {
      const next = v || PREMIUM_VOICES[0].id
      if (next === voice) return
      const wasActive = status === "playing" || status === "loading"
      const resumeIndex = index
      stop()
      setVoice(next)
      if (wasActive) pendingResumeRef.current = resumeIndex
    },
    [stop, voice, status, index],
  )

  // After a voice switch, resume playback of the pending section with the now
  // updated (voice-aware) playChunk.
  useEffect(() => {
    if (pendingResumeRef.current == null) return
    const i = pendingResumeRef.current
    pendingResumeRef.current = null
    void playChunk(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])

  // Toggle between the document's original language and an automatic
  // translation into the reader's device language. No manual language menu.
  const toggleTranslation = useCallback(() => {
    stop()
    setError(null)
    if (lang === ORIGINAL) {
      setLang(deviceLang)
      void translateInBackground(deviceLang, 0)
    } else {
      setLang(ORIGINAL)
      setTranslating(false)
    }
  }, [lang, deviceLang, stop, translateInBackground])

  // Automatically translate into the device language the first time we detect
  // that it differs from the document's language.
  const autoTranslatedRef = useRef(false)
  useEffect(() => {
    if (autoTranslatedRef.current) return
    if (canTranslate) {
      autoTranslatedRef.current = true
      setLang(deviceLang)
      void translateInBackground(deviceLang, 0)
    }
  }, [canTranslate, deviceLang, translateInBackground])

  const progress =
    chunks.length > 0 ? Math.round((index / chunks.length) * 100) : 0
  const busy = status === "loading"
  const showTranslateProgress =
    lang !== ORIGINAL && translating && doneCount < chunks.length
  const selectedVoice = getPremiumVoice(voice) ?? PREMIUM_VOICES[0]
  const deviceLabel = deviceLang ? languageLabel(deviceLang) : ""
  const isTranslated = lang !== ORIGINAL

  if (immersive) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:p-4">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio
          ref={audioRef}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          className="hidden"
        />

        {topSlot && (
          <div className="mb-2 border-b border-border pb-2">{topSlot}</div>
        )}

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Voice: ${selectedVoice.name}. Tap to change.`}
              className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <img
                src={selectedVoice.image || "/placeholder.svg"}
                alt={`${selectedVoice.name} voice`}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-primary/20 transition group-hover:ring-primary/50"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <ChevronDown className="h-2.5 w-2.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                Voice
              </div>
              {PREMIUM_VOICES.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => handleVoiceChange(v.id)}
                  className="gap-2.5 py-2"
                >
                  <img
                    src={v.image || "/placeholder.svg"}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="text-sm font-medium">{v.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {v.tagline}
                    </span>
                  </span>
                  <Check
                    className={cn(
                      "h-4 w-4 shrink-0",
                      voice === v.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => playChunk(Math.max(0, index - 1))}
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Previous section"
            disabled={index <= 0}
          >
            <SkipBack className="h-5 w-5" />
          </Button>

          <Button
            onClick={handlePlayPause}
            size="icon"
            className="h-12 w-12 shrink-0 rounded-full"
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
            onClick={() => playChunk(Math.min(chunks.length - 1, index + 1))}
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            aria-label="Next section"
            disabled={index >= chunks.length - 1}
          >
            <SkipForward className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground tabular-nums">
              <Sparkles className="h-3 w-3 text-primary" />
              {status === "loading"
                ? "Loading…"
                : `${selectedVoice.name} · Section ${Math.min(index + 1, chunks.length)} of ${chunks.length}`}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: "secondary" }),
                "h-9 shrink-0 gap-1.5 px-3 tabular-nums",
              )}
            >
              <Gauge className="h-4 w-4" />
              {rate}x
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-28">
              {RATES.map((r) => (
                <DropdownMenuItem
                  key={r}
                  onClick={() => setRate(r)}
                  className="justify-between tabular-nums"
                >
                  {r}x
                  <Check
                    className={cn(
                      "h-4 w-4",
                      rate === r ? "opacity-100" : "opacity-0",
                    )}
                  />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {canTranslate && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Languages className="h-3.5 w-3.5" />
              {isTranslated ? `Translated to ${deviceLabel}` : `In ${languageLabel(sourceNorm)}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={toggleTranslation}
            >
              {isTranslated ? `Original` : `Translate`}
            </Button>
            {showTranslateProgress && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {doneCount}/{chunks.length}
              </span>
            )}
          </div>
        )}

        {error && (
          <p className="mt-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }

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
              {`Section ${Math.min(index + 1, chunks.length)} of ${chunks.length}`}
            </p>
          </div>

          <Select value={voice} onValueChange={handleVoiceChange}>
            <SelectTrigger className="h-11 w-[184px] gap-2" aria-label="Voice">
              <span className="flex min-w-0 items-center gap-2.5">
                <img
                  src={selectedVoice.image || "/placeholder.svg"}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
                <span className="flex min-w-0 flex-col text-left leading-tight">
                  <span className="truncate text-sm font-medium">
                    {selectedVoice.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {selectedVoice.tagline}
                  </span>
                </span>
              </span>
            </SelectTrigger>
            <SelectContent>
              {PREMIUM_VOICES.map((v) => (
                <SelectItem key={v.id} value={v.id} className="py-2">
                  <span className="flex items-center gap-2.5">
                    <img
                      src={v.image || "/placeholder.svg"}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                    <span className="flex flex-col leading-tight">
                      <span className="text-sm font-medium">{v.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {v.tagline}
                      </span>
                    </span>
                  </span>
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

        {/* Automatic translation status + toggle (no manual language menu). */}
        {canTranslate && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              <Languages className="h-3.5 w-3.5" />
              {isTranslated
                ? `Auto-translated to ${deviceLabel}`
                : `In ${languageLabel(sourceNorm)}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={toggleTranslation}
            >
              {isTranslated
                ? `Show original (${languageLabel(sourceNorm)})`
                : `Translate to ${deviceLabel}`}
            </Button>
            {showTranslateProgress && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Translating {doneCount}/{chunks.length}
              </span>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Studio-quality voices generated on demand. Playback starts instantly.
          {canTranslate
            ? " When a document isn't in your language, it's translated automatically as it plays."
            : ""}
        </p>
      </div>

      {showReader && (
        <ReaderPanel
          title={title}
          text={activeText}
          words={words}
          currentWord={currentWord}
          onWordClick={handleWordClick}
        />
      )}

      {/* Floating controls so the user can always pause/stop without scrolling
          back up to the card on long documents. */}
      {status !== "idle" && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6">
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md">
            <img
              src={selectedVoice.image || "/placeholder.svg"}
              alt={`${selectedVoice.name} voice`}
              className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-primary/20"
            />
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
