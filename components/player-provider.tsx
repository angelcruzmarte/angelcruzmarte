"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { Pause, Play, Loader2, ChevronUp } from "lucide-react"
import { VoiceAvatar } from "@/components/voice-avatar"
import { useListeningPreferences } from "@/components/listening-preferences"
import { VOXYFI_ARTWORK, buildMediaArtwork } from "@/lib/document-artwork"

export type PlayerStatus = "idle" | "loading" | "playing" | "paused"

/** Resolves the persistent audio URL for section `i`, or null on failure. */
export type ChunkResolver = (i: number) => Promise<string | null>

export interface PlayerSession {
  /** Stable id for the content being played (dedupes remounts of the reader). */
  id: string
  /** Human-readable title shown in the mini-player. */
  title: string
  /** Route back to the full reader/player for this content. */
  expandHref: string
  /** Total number of narration sections. */
  total: number
  /** Active voice display name. */
  voiceName: string
  /** Active voice avatar image, if any. */
  voiceImage?: string
  /**
   * High-res artwork source (image URL or data URL) for OS now-playing surfaces
   * (Lock Screen, Live Activities, Apple Watch, notifications, media controls).
   * Falls back to the VOXYFI logo when omitted.
   */
  artworkUrl?: string
}

interface PlayerContextValue {
  session: PlayerSession | null
  status: PlayerStatus
  index: number
  /** Progress within the current section, 0..1. */
  fraction: number
  rate: number
  /** Whether the full reader/player is currently mounted (hides the mini-bar). */
  fullPlayerMounted: boolean
  /** Minutes selected for the sleep timer, or null when off. */
  sleepMinutes: number | null
  /** Milliseconds remaining on the active sleep timer, or null when off. */
  sleepRemainingMs: number | null
  /**
   * Register (or refresh) the current playback source. Passing a new session id
   * resets playback to the start; the same id just refreshes metadata/resolver
   * (e.g. after a voice switch) without interrupting audio.
   */
  setSource: (session: PlayerSession, resolve: ChunkResolver) => void
  setFullPlayerMounted: (mounted: boolean) => void
  play: (i?: number) => void
  toggle: () => void
  pause: () => void
  stop: () => void
  next: () => void
  prev: () => void
  setRate: (r: number) => void
  /** Start a sleep timer for `minutes`, or pass null to cancel it. */
  setSleep: (minutes: number | null) => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer must be used within <PlayerProvider>")
  return ctx
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const resolverRef = useRef<ChunkResolver | null>(null)

  const [session, setSession] = useState<PlayerSession | null>(null)
  const [status, setStatus] = useState<PlayerStatus>("idle")
  const [index, setIndex] = useState(0)
  const [fraction, setFraction] = useState(0)
  const [rate, setRateState] = useState(1)
  const [fullPlayerMounted, setFullPlayerMounted] = useState(false)
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null)
  const [sleepRemainingMs, setSleepRemainingMs] = useState<number | null>(null)

  // Mirror volatile state into refs so async playback callbacks never read a
  // stale value (the audio element outlives individual renders).
  const statusRef = useRef(status)
  statusRef.current = status
  const indexRef = useRef(index)
  indexRef.current = index
  const rateRef = useRef(rate)
  rateRef.current = rate
  const totalRef = useRef(0)
  totalRef.current = session?.total ?? 0

  const play = useCallback(async (i?: number) => {
    const audio = audioRef.current
    const resolve = resolverRef.current
    if (!audio || !resolve) return
    const target = i ?? indexRef.current
    if (target < 0 || (totalRef.current && target >= totalRef.current)) return
    setStatus("loading")
    setIndex(target)
    setFraction(0)
    // Retry a couple of times if the TTS backend is briefly throttled so the
    // user doesn't have to press play again.
    let url = await resolve(target)
    for (let attempt = 0; !url && attempt < 2; attempt++) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)))
      url = await resolve(target)
    }
    if (!url) {
      setStatus("paused")
      return
    }
    audio.src = url
    audio.playbackRate = rateRef.current
    try {
      await audio.play()
      setStatus("playing")
      // Prefetch the next section for seamless playback.
      if (target + 1 < totalRef.current) void resolve(target + 1)
    } catch {
      setStatus("paused")
    }
  }, [])

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (statusRef.current === "playing") {
      audio.pause()
      setStatus("paused")
    } else if (statusRef.current === "paused" && audio.src) {
      void audio.play()
      setStatus("playing")
    } else {
      void play(indexRef.current)
    }
  }, [play])

  const pause = useCallback(() => {
    const audio = audioRef.current
    if (audio && !audio.paused) audio.pause()
    setStatus((s) => (s === "playing" || s === "loading" ? "paused" : s))
  }, [])

  const stop = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setStatus("idle")
    setIndex(0)
    setFraction(0)
  }, [])

  const next = useCallback(() => {
    void play(Math.min(totalRef.current - 1, indexRef.current + 1))
  }, [play])

  const prev = useCallback(() => {
    void play(Math.max(0, indexRef.current - 1))
  }, [play])

  const setRate = useCallback((r: number) => {
    setRateState(r)
    if (audioRef.current) audioRef.current.playbackRate = r
  }, [])

  // Sleep timer: pause playback once the countdown reaches zero. The deadline
  // lives in a ref so the ticking effect never needs to re-subscribe.
  const sleepDeadlineRef = useRef<number | null>(null)
  const setSleep = useCallback((minutes: number | null) => {
    if (!minutes) {
      sleepDeadlineRef.current = null
      setSleepMinutes(null)
      setSleepRemainingMs(null)
      return
    }
    sleepDeadlineRef.current = Date.now() + minutes * 60_000
    setSleepMinutes(minutes)
    setSleepRemainingMs(minutes * 60_000)
  }, [])

  useEffect(() => {
    if (sleepMinutes === null) return
    const id = setInterval(() => {
      const deadline = sleepDeadlineRef.current
      if (deadline === null) return
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        sleepDeadlineRef.current = null
        setSleepMinutes(null)
        setSleepRemainingMs(null)
        const audio = audioRef.current
        if (audio && !audio.paused) audio.pause()
        setStatus((s) => (s === "playing" || s === "loading" ? "paused" : s))
      } else {
        setSleepRemainingMs(remaining)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [sleepMinutes])

  const setSource = useCallback(
    (next: PlayerSession, resolve: ChunkResolver) => {
      resolverRef.current = resolve
      setSession((prev) => {
        if (prev && prev.id === next.id) {
          // Same content remounting (e.g. returning to the reader) or a voice
          // switch: adopt ongoing playback, just refresh metadata.
          return { ...prev, ...next }
        }
        // New content: reset transport.
        const audio = audioRef.current
        if (audio) {
          audio.pause()
          audio.currentTime = 0
        }
        setStatus("idle")
        setIndex(0)
        setFraction(0)
        return next
      })
    },
    [],
  )

  const handleEnded = useCallback(() => {
    const i = indexRef.current
    if (i + 1 < totalRef.current) void play(i + 1)
    else stop()
  }, [play, stop])

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audio.duration || Number.isNaN(audio.duration)) return
    setFraction(Math.min(1, audio.currentTime / audio.duration))
    // Drive the Lock Screen / Now Playing scrubber for the current section.
    if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.setPositionState?.({
          duration: audio.duration,
          position: Math.min(audio.currentTime, audio.duration),
          playbackRate: audio.playbackRate || 1,
        })
      } catch {
        // Some browsers reject partial position state; safe to ignore.
      }
    }
  }, [])

  // --- OS media integration (MediaSession API) ------------------------------
  // Setting metadata + handlers here is what populates the iPhone Lock Screen,
  // Live Activities, Apple Watch Now Playing, Android notification, and the
  // hardware/media-key controls. Artwork uses the document thumbnail when
  // available, otherwise the VOXYFI logo.
  const hasMediaSession =
    typeof navigator !== "undefined" && "mediaSession" in navigator

  // Metadata (title + artwork) — refreshes whenever the playing document,
  // its artwork, or the active voice changes.
  useEffect(() => {
    if (!hasMediaSession) return
    if (!session) {
      navigator.mediaSession.metadata = null
      return
    }
    const art = session.artworkUrl || VOXYFI_ARTWORK
    navigator.mediaSession.metadata = new MediaMetadata({
      title: session.title,
      artist: session.voiceName ? `VOXYFI · ${session.voiceName}` : "VOXYFI",
      album: "VOXYFI",
      artwork: buildMediaArtwork(art),
    })
  }, [hasMediaSession, session])

  // Transport action handlers (play/pause/next/prev/seek/stop). Registered once
  // and kept current via the stable callbacks above.
  useEffect(() => {
    if (!hasMediaSession) return
    const ms = navigator.mediaSession
    const set = (
      action: MediaSessionAction,
      handler: MediaSessionActionHandler | null,
    ) => {
      try {
        ms.setActionHandler(action, handler)
      } catch {
        // Unsupported action in this browser — ignore.
      }
    }
    set("play", () => {
      if (statusRef.current !== "playing") toggle()
    })
    set("pause", () => {
      if (statusRef.current === "playing") toggle()
    })
    set("previoustrack", () => prev())
    set("nexttrack", () => next())
    set("seekbackward", () => prev())
    set("seekforward", () => next())
    set("stop", () => stop())
    return () => {
      ;(
        [
          "play",
          "pause",
          "previoustrack",
          "nexttrack",
          "seekbackward",
          "seekforward",
          "stop",
        ] as MediaSessionAction[]
      ).forEach((a) => set(a, null))
    }
  }, [hasMediaSession, toggle, prev, next, stop])

  // Keep the OS play/pause indicator in sync with our transport state.
  useEffect(() => {
    if (!hasMediaSession) return
    navigator.mediaSession.playbackState =
      status === "playing" ? "playing" : status === "paused" ? "paused" : "none"
  }, [hasMediaSession, status])

  // When the docked mini-player is visible it floats above the tab bar, so flag
  // <body> and let global CSS add extra bottom padding to the page content.
  // Without this, the last section on a page (e.g. the "Create with AI" tiles)
  // is obscured by the bar.
  const miniPlayerVisible =
    !!session && status !== "idle" && !fullPlayerMounted
  useEffect(() => {
    const body = document.body
    if (miniPlayerVisible) body.dataset.miniplayer = "true"
    else delete body.dataset.miniplayer
    return () => {
      delete body.dataset.miniplayer
    }
  }, [miniPlayerVisible])

  const value = useMemo<PlayerContextValue>(
    () => ({
      session,
      status,
      index,
      fraction,
      rate,
      fullPlayerMounted,
      sleepMinutes,
      sleepRemainingMs,
      setSource,
      setFullPlayerMounted,
      play,
      toggle,
      pause,
      stop,
      next,
      prev,
      setRate,
      setSleep,
    }),
    [
      session,
      status,
      index,
      fraction,
      rate,
      fullPlayerMounted,
      sleepMinutes,
      sleepRemainingMs,
      setSource,
      play,
      toggle,
      pause,
      stop,
      next,
      prev,
      setRate,
      setSleep,
    ],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <MiniPlayer />
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        className="hidden"
      />
    </PlayerContext.Provider>
  )
}

/**
 * Compact docked mini-player. Shows title + voice, a play/pause control, and a
 * tap target to expand back to the full reader. Hidden while the full reader is
 * mounted (which has its own controls) and when nothing is playing.
 */
function MiniPlayer() {
  const { session, status, index, fraction, fullPlayerMounted, toggle } =
    usePlayer()
  const { autoHide } = useListeningPreferences()

  // "Auto-Hide Player": when enabled, collapse the docked player after a few
  // seconds of being paused. It reappears whenever playback resumes or the
  // user taps the peek handle.
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    if (!autoHide) {
      setHidden(false)
      return
    }
    if (status === "playing") {
      setHidden(false)
      return
    }
    // Paused/loading: schedule a hide after a short idle delay.
    const t = setTimeout(() => setHidden(true), 4000)
    return () => clearTimeout(t)
  }, [autoHide, status])

  if (!session || status === "idle" || fullPlayerMounted) return null

  const total = Math.max(1, session.total)
  const progress = Math.min(100, ((index + fraction) / total) * 100)
  const busy = status === "loading"

  if (hidden) {
    return (
      <div className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
        <button
          type="button"
          onClick={() => setHidden(false)}
          aria-label="Show player"
          className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur"
        >
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
          Show player
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-x-0 bottom-24 z-40 px-4">
      <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-border bg-card/95 shadow-lg backdrop-blur">
        <div className="h-1 w-full bg-primary/15">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-3 p-2.5">
          <VoiceAvatar
            name={session.voiceName}
            image={session.voiceImage}
            size={40}
            ring
            alt=""
          />
          <Link
            href={session.expandHref}
            className="flex min-w-0 flex-1 flex-col leading-tight"
            aria-label={`Open ${session.title}`}
          >
            <span className="truncate text-sm font-semibold text-foreground">
              {session.title}
            </span>
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <ChevronUp className="h-3 w-3" aria-hidden="true" />
              {busy
                ? `${session.voiceName} · Preparing audio…`
                : `${session.voiceName} · Section ${Math.min(index + 1, total)} of ${total}`}
            </span>
          </Link>
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-label={status === "playing" ? "Pause" : "Play"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-70"
          >
            {busy ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : status === "playing" ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5 translate-x-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
