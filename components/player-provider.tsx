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
  }, [])

  const value = useMemo<PlayerContextValue>(
    () => ({
      session,
      status,
      index,
      fraction,
      rate,
      fullPlayerMounted,
      setSource,
      setFullPlayerMounted,
      play,
      toggle,
      pause,
      stop,
      next,
      prev,
      setRate,
    }),
    [
      session,
      status,
      index,
      fraction,
      rate,
      fullPlayerMounted,
      setSource,
      play,
      toggle,
      pause,
      stop,
      next,
      prev,
      setRate,
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

  if (!session || status === "idle" || fullPlayerMounted) return null

  const total = Math.max(1, session.total)
  const progress = Math.min(100, ((index + fraction) / total) * 100)
  const busy = status === "loading"

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
                ? "Loading…"
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
