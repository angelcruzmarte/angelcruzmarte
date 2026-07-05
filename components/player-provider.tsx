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
import { tokenize } from "@/hooks/use-speech"
import { isHumanLikeVoice, voiceQualityScore } from "@/lib/voices"
import { recordListening } from "@/app/actions/stats"

export type PlayerTrack = {
  id: number
  title: string
  content: string
}

type Status = "idle" | "playing" | "paused"

type PlayerContextValue = {
  track: PlayerTrack | null
  status: Status
  currentWord: number
  totalWords: number
  rate: number
  loadAndPlay: (track: PlayerTrack) => void
  toggle: () => void
  rewindWords: (n: number) => void
  setRate: (rate: number) => void
  close: () => void
  stop: () => void
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

const RATE_KEY = "voxyfi:avgSpeed"

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState<PlayerTrack | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [currentWord, setCurrentWord] = useState(-1)
  const [rate, setRateState] = useState(1)

  const wordsRef = useRef<ReturnType<typeof tokenize>>([])
  const contentRef = useRef("")
  const rateRef = useRef(1)
  const currentWordRef = useRef(-1)
  const statusRef = useRef<Status>("idle")
  const internalStopRef = useRef(false)

  // ----- Listening analytics tracking -----
  // Accumulate un-flushed seconds + words, then persist them periodically and
  // on pause/stop/unmount so the Statistics screen reflects real usage.
  const pendingSecondsRef = useRef(0)
  const pendingWordsRef = useRef(0)
  const maxWordRef = useRef(-1)
  const lastTickRef = useRef<number | null>(null)

  const totalWords = wordsRef.current.length

  const localDay = useCallback(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }, [])

  // Add elapsed wall-clock time since the last tick to the pending counter.
  const accrueTime = useCallback(() => {
    if (lastTickRef.current != null) {
      const elapsed = (Date.now() - lastTickRef.current) / 1000
      // Ignore absurd gaps (e.g. tab was backgrounded for a long time).
      if (elapsed > 0 && elapsed < 120) {
        pendingSecondsRef.current += elapsed
      }
    }
    lastTickRef.current = statusRef.current === "playing" ? Date.now() : null
  }, [])

  // Persist accumulated listening to the DB and reset counters.
  const flush = useCallback(() => {
    accrueTime()
    const seconds = Math.round(pendingSecondsRef.current)
    const words = pendingWordsRef.current
    if (seconds <= 0 && words <= 0) return
    pendingSecondsRef.current = 0
    pendingWordsRef.current = 0
    void recordListening({ seconds, words, day: localDay() }).catch(() => {})
  }, [accrueTime, localDay])

  const speakFrom = useCallback((index: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const synth = window.speechSynthesis
    const words = wordsRef.current
    if (words.length === 0) return
    const clamped = Math.max(0, Math.min(index, words.length - 1))
    const startOffset = words[clamped].start
    const slice = contentRef.current.slice(startOffset)
    if (!slice.trim()) return

    internalStopRef.current = true
    synth.cancel()

    const utterance = new SpeechSynthesisUtterance(slice)
    utterance.rate = rateRef.current
    // Natural pitch and full volume for the clearest, most intelligible output.
    utterance.pitch = 1
    utterance.volume = 1
    // Prefer natural, human-like English voices ranked by expected clarity so
    // narration uses the clearest, most premium-sounding device voice.
    const english = synth
      .getVoices()
      .filter((v) => v.lang.startsWith("en") && isHumanLikeVoice(v.name))
    const preferred =
      english.slice().sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))[0] ??
      synth.getVoices().find((v) => v.lang.startsWith("en"))
    if (preferred) {
      utterance.voice = preferred
      utterance.lang = preferred.lang
    }

    utterance.onboundary = (event) => {
      if (event.name === "sentence") return
      const globalIndex = startOffset + event.charIndex
      let idx = 0
      const w = wordsRef.current
      for (let i = 0; i < w.length; i++) {
        if (w[i].start <= globalIndex) idx = i
        else break
      }
      currentWordRef.current = idx
      // Count each newly-reached word exactly once (monotonic high-water mark)
      // for the "words listened" statistic.
      if (idx > maxWordRef.current) {
        pendingWordsRef.current += idx - maxWordRef.current
        maxWordRef.current = idx
      }
      setCurrentWord(idx)
    }

    utterance.onend = () => {
      if (internalStopRef.current) {
        internalStopRef.current = false
        return
      }
      statusRef.current = "idle"
      setStatus("idle")
      flush()
      currentWordRef.current = -1
      setCurrentWord(-1)
    }

    statusRef.current = "playing"
    setStatus("playing")
    currentWordRef.current = clamped
    // Reset the word high-water mark to where playback resumes so we only count
    // words as they are freshly narrated from this point forward.
    maxWordRef.current = clamped - 1
    lastTickRef.current = Date.now()
    setCurrentWord(clamped)

    setTimeout(() => {
      internalStopRef.current = false
      synth.speak(utterance)
    }, 60)
  }, [flush])

  const loadAndPlay = useCallback(
    (next: PlayerTrack) => {
      contentRef.current = next.content
      wordsRef.current = tokenize(next.content)
      currentWordRef.current = 0
      setTrack(next)
      setCurrentWord(0)
      speakFrom(0)
    },
    [speakFrom],
  )

  const toggle = useCallback(() => {
    if (typeof window === "undefined") return
    const synth = window.speechSynthesis
    if (statusRef.current === "playing") {
      synth.pause()
      statusRef.current = "paused"
      setStatus("paused")
      flush()
    } else if (statusRef.current === "paused") {
      synth.resume()
      statusRef.current = "playing"
      setStatus("playing")
      lastTickRef.current = Date.now()
    } else {
      speakFrom(currentWordRef.current >= 0 ? currentWordRef.current : 0)
    }
  }, [speakFrom, flush])

  const rewindWords = useCallback(
    (n: number) => {
      const base = currentWordRef.current >= 0 ? currentWordRef.current : 0
      const target = Math.max(0, base - n)
      currentWordRef.current = target
      setCurrentWord(target)
      if (statusRef.current !== "idle") speakFrom(target)
    },
    [speakFrom],
  )

  const stop = useCallback(() => {
    if (typeof window === "undefined") return
    internalStopRef.current = true
    window.speechSynthesis.cancel()
    statusRef.current = "idle"
    setStatus("idle")
    flush()
    currentWordRef.current = -1
    setCurrentWord(-1)
  }, [flush])

  const close = useCallback(() => {
    stop()
    setTrack(null)
  }, [stop])

  const setRate = useCallback(
    (value: number) => {
      setRateState(value)
      rateRef.current = value
      try {
        window.localStorage.setItem(RATE_KEY, String(value))
      } catch {}
      if (statusRef.current === "playing") {
        speakFrom(currentWordRef.current >= 0 ? currentWordRef.current : 0)
      }
    },
    [speakFrom],
  )

  // Restore last used rate.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(RATE_KEY))
      if (saved && saved > 0) {
        setRateState(saved)
        rateRef.current = saved
      }
    } catch {}
  }, [])

  // Cancel speech on unmount and persist any pending listening time.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
      flush()
    }
  }, [flush])

  // Persist listening periodically while playing, and when the tab is hidden or
  // the page is being unloaded, so stats survive navigation and app close.
  useEffect(() => {
    if (typeof window === "undefined") return
    const interval = window.setInterval(() => {
      if (statusRef.current === "playing") flush()
    }, 15000)

    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("pagehide", flush)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("pagehide", flush)
    }
  }, [flush])

  const value = useMemo<PlayerContextValue>(
    () => ({
      track,
      status,
      currentWord,
      totalWords,
      rate,
      loadAndPlay,
      toggle,
      rewindWords,
      setRate,
      close,
      stop,
    }),
    [track, status, currentWord, totalWords, rate, loadAndPlay, toggle, rewindWords, setRate, close, stop],
  )

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error("usePlayer must be used within a PlayerProvider")
  return ctx
}
