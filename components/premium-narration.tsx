"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
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
  Lock,
  Moon,
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
import { VoiceAvatar } from "@/components/voice-avatar"
import { usePlayer } from "@/components/player-provider"
import { useListeningPreferences } from "@/components/listening-preferences"
import { cn } from "@/lib/utils"
import { chunkForNarration } from "@/lib/chunk-text"
import { stripBoilerplate } from "@/lib/strip-boilerplate"
import { tokenize } from "@/hooks/use-speech"
import { generatePremiumSpeech } from "@/app/actions/speech"
import {
  translatePassage,
  translateDocumentSection,
  getDocumentTranslations,
} from "@/app/actions/ai"
import { sectionHash } from "@/lib/hash"
import {
  PREMIUM_VOICES,
  getPremiumVoice,
  isFreePreviewVoice,
  DEFAULT_FREE_VOICE_ID,
} from "@/lib/voices"
import {
  normalizeLang,
  isSupportedLang,
  languageLabel,
} from "@/lib/languages"

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2]
const SLEEP_OPTIONS = [5, 10, 15, 30, 45, 60]

/** mm:ss for a sleep-timer countdown given milliseconds remaining. */
function formatSleep(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, "0")}`
}
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
  documentId,
  sourceLang,
  artworkUrl,
  showReader = true,
  immersive = false,
  topSlot,
  paused = false,
  subscribed = true,
  onActiveWord,
  onPlayingChange,
}: {
  text: string
  title: string
  /**
   * The owning document's id, when narrating a user document. Enables the
   * durable translation cache (translated pages persist across reloads and are
   * never re-translated). Omitted for books and other non-document sources.
   */
  documentId?: number
  /** Detected language of the document (BCP-47/ISO code), if known. */
  sourceLang?: string | null
  /**
   * High-res artwork (image/data URL) shown on OS now-playing surfaces (Lock
   * Screen, Apple Watch, notifications, media controls). Defaults to the VOXYFI
   * logo when omitted.
   */
  artworkUrl?: string
  /** When false, the internal text reader is hidden (e.g. showing original). */
  showReader?: boolean
  /**
   * Whether the current user has an active subscription. When false, only the
   * free preview voices are usable; every other voice is locked and prompts the
   * user to subscribe.
   */
  subscribed?: boolean
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
  const router = useRouter()
  const pathname = usePathname()
  const player = usePlayer()
  // Cache of persistent audio URLs keyed by `${lang}:${voice}:${chunkIndex}`.
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Dedupe concurrent audio (translate + TTS) requests for the same key so a
  // background prewarm and a user pressing play never generate speech twice.
  const audioInflightRef = useRef<Map<string, Promise<string | null>>>(new Map())

  // Free (non-subscriber) users can only select the free preview voices.
  const canUseVoice = useCallback(
    (id: string) => subscribed || isFreePreviewVoice(id),
    [subscribed],
  )

  const [voice, setVoice] = useState<string>(
    subscribed ? PREMIUM_VOICES[0].id : DEFAULT_FREE_VOICE_ID,
  )
  const [error, setError] = useState<string | null>(null)

  // Playback state is owned by the global player provider so audio survives
  // navigation (and drives the docked mini-player on other screens). The
  // methods are individually stable (useCallback), so we destructure them and
  // depend on those — NOT the `player` object, whose identity changes on every
  // progress tick and would otherwise re-run effects continuously.
  const { status, index, fraction, rate } = player
  const {
    setSource,
    setFullPlayerMounted,
    play,
    toggle,
    pause,
    stop,
    setRate,
  } = player

  // Listening preferences from Settings (auto-play / auto-skip / …).
  const preferences = useListeningPreferences()

  // "Auto Skip Content": strip headers, footers, page numbers and citations
  // from the narrated text so the voice reads only the real content.
  const effectiveText = useMemo(
    () => (preferences.autoSkip ? stripBoilerplate(text) : text),
    [text, preferences.autoSkip],
  )

  // Narration sections come from the ORIGINAL text so their boundaries stay
  // stable across languages. Translations are stored per section and filled in
  // progressively, so switching language and starting playback feels instant.
  const sourceChunks = useMemo(
    () => chunkForNarration(effectiveText),
    [effectiveText],
  )

  // Translation state. `lang` is either the sentinel "original" (narrate the
  // document as-is) or a target language code we translate INTO.
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
  // Translation is a premium capability, offered only when we know the
  // document's language, the reader's device language is one we support, and
  // the two differ. Free users never trigger it (it calls a premium action).
  const canTranslate =
    subscribed &&
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

  // Approximate active word: map audio progress within the current section onto
  // its word range so the reader tracks and auto-scrolls during playback.
  const currentWord = useMemo(() => {
    if (status === "idle") return -1
    const localCount = countWords(chunks[index] ?? "")
    const local = Math.min(localCount - 1, Math.floor(fraction * localCount))
    return (offsets[index] ?? 0) + Math.max(0, local)
  }, [status, index, fraction, chunks, offsets])

  // Surface the approximate active word so an external follow-along view (the
  // PDF pages) can track playback position. Held in a ref so an inline parent
  // callback doesn't retrigger this effect every render.
  const onActiveWordRef = useRef(onActiveWord)
  onActiveWordRef.current = onActiveWord
  useEffect(() => {
    onActiveWordRef.current?.(currentWord, words.length)
  }, [currentWord, words.length])

  // Surface whether audio is actively playing so the external follow-along view
  // only auto-scrolls during playback.
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
        // Prefer the durable, cache-aware server action for user documents so a
        // section is translated at most once ever (and persists across reloads).
        // Fall back to the stateless passage translator for non-document
        // sources (e.g. books) that have no id to key a cache by.
        const t =
          documentId !== undefined
            ? await translateDocumentSection(documentId, targetLang, sourceChunks[i])
            : await translatePassage(sourceChunks[i], targetLang)
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
    [sourceChunks, documentId],
  )

  // Target languages already hydrated from the durable cache (once each).
  const hydratedRef = useRef<Set<string>>(new Set())

  // Load every already-translated page for `targetLang` from the durable cache
  // in a single round trip and drop it straight into state — so previously
  // translated pages appear instantly with zero translation-API calls. Matches
  // cached rows to the current sections by source-text hash, so it stays correct
  // even if section boundaries shifted. Best-effort and safe to call repeatedly.
  const hydrateFromCache = useCallback(
    async (targetLang: string) => {
      if (documentId === undefined || targetLang === ORIGINAL) return
      if (hydratedRef.current.has(targetLang)) return
      hydratedRef.current.add(targetLang)
      try {
        const map = await getDocumentTranslations(documentId, targetLang)
        if (langRef.current !== targetLang || Object.keys(map).length === 0) return
        setSections((prev) => {
          const arr = prev[targetLang]
            ? prev[targetLang].slice()
            : new Array<string | undefined>(sourceChunks.length).fill(undefined)
          for (let i = 0; i < sourceChunks.length; i++) {
            if (arr[i]) continue
            const hit = map[sectionHash(sourceChunks[i])]
            if (hit) arr[i] = hit
          }
          return { ...prev, [targetLang]: arr }
        })
      } catch {
        hydratedRef.current.delete(targetLang) // allow a later retry
      }
    },
    [documentId, sourceChunks],
  )

  // Progressively translate sections in the background (bounded concurrency),
  // starting from `startAt` (the visible/about-to-play section) so it's ready
  // first, then fanning out. Cached pages are hydrated first, so this only
  // spends API calls on pages that have never been translated.
  const translateInBackground = useCallback(
    async (targetLang: string, startAt: number) => {
      if (targetLang === ORIGINAL) return
      // Instant: fill in anything already translated before doing any work.
      await hydrateFromCache(targetLang)
      if (langRef.current !== targetLang) return
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
    [sourceChunks, translateSection, hydrateFromCache],
  )

  // Resolver handed to the global player: returns a persistent, cached MP3 URL
  // for section `i` (translating on demand first when needed).
  const loadChunk = useCallback(
    async (i: number): Promise<string | null> => {
      const key = `${lang}:${voice}:${i}`
      const cached = cacheRef.current.get(key)
      if (cached) return cached
      // Dedupe concurrent requests for the same section so a background prewarm
      // and the user pressing play (or the provider's next-section prefetch)
      // never translate + generate speech twice.
      const running = audioInflightRef.current.get(key)
      if (running) return running

      const work = (async (): Promise<string | null> => {
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
        cacheRef.current.set(key, res.url)
        return res.url
      })()

      audioInflightRef.current.set(key, work)
      void work.finally(() => audioInflightRef.current.delete(key))
      return work
    },
    [sourceChunks, voice, lang, translateSection],
  )

  const selectedVoice = getPremiumVoice(voice) ?? PREMIUM_VOICES[0]

  // Stable id for this content so the provider can dedupe reader remounts and
  // adopt ongoing playback instead of restarting.
  const sessionId = useMemo(
    () => `${title}::${text.length}::${countWords(text)}`,
    [title, text],
  )

  // Register (and keep fresh) the playback source with the global player. This
  // re-runs when the resolver changes (voice/lang switch) so the provider keeps
  // a current resolver without interrupting playback (same session id).
  useEffect(() => {
    setSource(
      {
        id: sessionId,
        title,
        expandHref: pathname || "/app",
        total: sourceChunks.length,
        voiceName: selectedVoice.name,
        voiceImage: selectedVoice.image,
        artworkUrl,
      },
      loadChunk,
    )
  }, [
    setSource,
    sessionId,
    title,
    pathname,
    sourceChunks.length,
    selectedVoice.name,
    selectedVoice.image,
    artworkUrl,
    loadChunk,
  ])

  // While the full reader is mounted it has its own controls, so hide the
  // docked mini-player. Restore it (and thus continue showing playback) once
  // the user navigates away.
  useEffect(() => {
    setFullPlayerMounted(true)
    return () => setFullPlayerMounted(false)
  }, [setFullPlayerMounted])

  // "Auto-Play Audio": start narration automatically the first time the reader
  // opens, honoring the user's Settings preference. Runs once, only while idle
  // and not force-paused (e.g. the free-tier cap). Navigating to the reader is
  // itself a user gesture, so browser autoplay policies allow this.
  const autoPlayedRef = useRef(false)
  useEffect(() => {
    if (!preferences.autoPlay || autoPlayedRef.current) return
    if (paused || status !== "idle" || sourceChunks.length === 0) return
    autoPlayedRef.current = true
    void play(index)
  }, [preferences.autoPlay, paused, status, sourceChunks.length, play, index])

  // When an AI tool panel opens (or any external force-pause), pause narration
  // so two audio sources don't overlap.
  useEffect(() => {
    if (paused) pause()
  }, [paused, pause])

  // Prewarm the first section's audio while the reader sits idle — translating
  // it first when in a translated language — so pressing Play starts almost
  // instantly instead of waiting on translation + TTS. loadChunk caches and
  // dedupes, so this never duplicates the work a subsequent play(0) does.
  // Re-runs whenever the language or voice changes.
  const prewarmKeyRef = useRef<string>("")
  useEffect(() => {
    if (paused || status !== "idle" || sourceChunks.length === 0) return
    const key = `${lang}:${voice}`
    if (prewarmKeyRef.current === key) return
    prewarmKeyRef.current = key
    void loadChunk(0)
  }, [paused, status, sourceChunks.length, lang, voice, loadChunk])

  // Preload the NEXT page while the user reads/listens: as the position moves,
  // jump the current and next sections to the front of the translation queue so
  // they're ready before the user gets there. translateSection dedupes and hits
  // the cache, so this is free for already-translated pages.
  useEffect(() => {
    if (lang === ORIGINAL || sourceChunks.length === 0) return
    void translateSection(lang, index)
    if (index + 1 < sourceChunks.length) void translateSection(lang, index + 1)
  }, [lang, index, sourceChunks.length, translateSection])

  const busy = status === "loading"
  const progress =
    chunks.length > 0 ? Math.round((index / chunks.length) * 100) : 0
  const showTranslateProgress =
    lang !== ORIGINAL && translating && doneCount < chunks.length
  const deviceLabel = deviceLang ? languageLabel(deviceLang) : ""
  const isTranslated = lang !== ORIGINAL

  const handlePlayPause = useCallback(() => toggle(), [toggle])

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
      void play(target)
    },
    [offsets, play],
  )

  // When the user switches voice, stop and — if it was playing — resume the
  // SAME section with the new voice once the resolver has updated.
  const pendingResumeRef = useRef<number | null>(null)
  const handleVoiceChange = useCallback(
    (v: string | null) => {
      const next = v || PREMIUM_VOICES[0].id
      if (next === voice) return
      // Locked voice for a free user: send them to subscribe instead.
      if (!canUseVoice(next)) {
        router.push("/subscribe")
        return
      }
      const wasActive = status === "playing" || status === "loading"
      const resumeIndex = index
      stop()
      setVoice(next)
      if (wasActive) pendingResumeRef.current = resumeIndex
    },
    [voice, status, index, canUseVoice, router, stop],
  )

  // After a voice switch, resume playback of the pending section. This runs
  // after the setSource effect above (defined earlier) has refreshed the
  // provider's resolver to the new voice.
  useEffect(() => {
    if (pendingResumeRef.current == null) return
    const i = pendingResumeRef.current
    pendingResumeRef.current = null
    void play(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice])

  // Toggle between the document's original language and an automatic
  // translation into the reader's device language.
  const toggleTranslation = useCallback(() => {
    stop()
    setError(null)
    if (lang === ORIGINAL) {
      setLang(deviceLang)
      // Start from where the reader currently is so the visible/about-to-play
      // section is translated first.
      void translateInBackground(deviceLang, index)
    } else {
      setLang(ORIGINAL)
      setTranslating(false)
    }
  }, [lang, deviceLang, index, translateInBackground, stop])

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

  if (immersive) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:p-4">
        {topSlot && (
          <div className="mb-2 border-b border-border pb-2">{topSlot}</div>
        )}

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Voice: ${selectedVoice.name}. Tap to change.`}
              className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <VoiceAvatar
                name={selectedVoice.name}
                image={selectedVoice.image}
                size={44}
                ring
                className="transition group-hover:ring-primary/50"
              />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-card">
                <ChevronDown className="h-2.5 w-2.5" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-[min(60vh,26rem)] w-56 overflow-y-auto"
            >
              <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
                {subscribed
                  ? `${PREMIUM_VOICES.length} voices`
                  : "Free preview · subscribe to unlock all"}
              </div>
              {PREMIUM_VOICES.map((v) => {
                const locked = !canUseVoice(v.id)
                return (
                  <DropdownMenuItem
                    key={v.id}
                    onClick={() => handleVoiceChange(v.id)}
                    className="gap-2.5 py-2"
                  >
                    <VoiceAvatar
                      name={v.name}
                      image={v.image}
                      size={36}
                      alt=""
                      className={cn(locked && "opacity-60")}
                    />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <span className={cn(locked && "text-muted-foreground")}>
                          {v.name}
                        </span>
                        {!subscribed && !locked && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                            Free
                          </span>
                        )}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {v.tagline}
                      </span>
                    </span>
                    {locked ? (
                      <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          voice === v.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                    )}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => player.play(Math.max(0, index - 1))}
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
            onClick={() => player.play(Math.min(chunks.length - 1, index + 1))}
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
                  onClick={() => player.setRate(r)}
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

          <SleepTimerButton />
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
            onClick={() => player.stop()}
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
                <VoiceAvatar
                  name={selectedVoice.name}
                  image={selectedVoice.image}
                  size={28}
                  alt=""
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
            <SelectContent className="max-h-[min(60vh,26rem)]">
              {!subscribed && (
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Free preview · subscribe to unlock all
                </div>
              )}
              {PREMIUM_VOICES.map((v) => {
                const locked = !canUseVoice(v.id)
                return (
                  <SelectItem key={v.id} value={v.id} className="py-2">
                    <span className="flex items-center gap-2.5">
                      <VoiceAvatar
                        name={v.name}
                        image={v.image}
                        size={36}
                        alt=""
                        className={cn(locked && "opacity-60")}
                      />
                      <span className="flex flex-col leading-tight">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <span className={cn(locked && "text-muted-foreground")}>
                            {v.name}
                          </span>
                          {locked ? (
                            <Lock className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            !subscribed && (
                              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Free
                              </span>
                            )
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {v.tagline}
                        </span>
                      </span>
                    </span>
                  </SelectItem>
                )
              })}
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
                <DropdownMenuItem key={r} onClick={() => player.setRate(r)}>
                  {r}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <SleepTimerButton />
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
        {!subscribed && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              You&apos;re previewing premium narration with a few free voices.
            </p>
            <Link
              href="/subscribe"
              className={cn(
                buttonVariants({ size: "sm" }),
                "ml-auto h-8 px-3 text-xs",
              )}
            >
              Unlock all voices
            </Link>
          </div>
        )}
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
          back up to the card on long documents. On screens that also show the
          global bottom tab bar (everything except the immersive /app/listen
          routes, where it's hidden), lift the bar above the tab bar so the two
          never overlap. */}
      {status !== "idle" && (
        <div
          className={cn(
            "fixed inset-x-0 z-40 px-4 sm:px-6",
            pathname?.startsWith("/app/listen")
              ? "bottom-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]"
              : "bottom-[calc(env(safe-area-inset-bottom,0px)+6rem)]",
          )}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md">
            <VoiceAvatar
              name={selectedVoice.name}
              image={selectedVoice.image}
              size={44}
              ring
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
              onClick={() => player.stop()}
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

/**
 * Sleep-timer control backed by the global player provider so the countdown
 * (and the auto-pause when it ends) survives navigation. Shows the remaining
 * time when active, otherwise a moon icon.
 */
function SleepTimerButton({ className }: { className?: string }) {
  const { sleepMinutes, sleepRemainingMs, setSleep } = usePlayer()
  const active = sleepMinutes !== null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Sleep timer"
        className={cn(
          buttonVariants({ variant: active ? "default" : "secondary" }),
          "h-9 shrink-0 gap-1.5 px-3 tabular-nums",
          className,
        )}
      >
        <Moon className="h-4 w-4" />
        {active && sleepRemainingMs !== null
          ? formatSleep(sleepRemainingMs)
          : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {active && (
          <DropdownMenuItem
            onClick={() => setSleep(null)}
            className="justify-between font-medium text-destructive"
          >
            Turn off
          </DropdownMenuItem>
        )}
        {SLEEP_OPTIONS.map((m) => (
          <DropdownMenuItem
            key={m}
            onClick={() => setSleep(m)}
            className="justify-between tabular-nums"
          >
            {m} min
            <Check
              className={cn(
                "h-4 w-4",
                sleepMinutes === m ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
