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
import {
  trackerAddWords,
  trackerPause,
  trackerStart,
  trackerStop,
} from "@/lib/listening-tracker"

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

  const totalWords = wordsRef.current.length

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
      // Count forward progress (in words) toward listening stats.
      const prev = currentWordRef.current
      if (idx > prev) trackerAddWords(idx - prev)
      currentWordRef.current = idx
      setCurrentWord(idx)
    }

    utterance.onend = () => {
      if (internalStopRef.current) {
        internalStopRef.current = false
        return
      }
      // Reached the end of the track: stop the timer and flush stats.
      trackerPause()
      statusRef.current = "idle"
      setStatus("idle")
      currentWordRef.current = -1
      setCurrentWord(-1)
    }

    statusRef.current = "playing"
    setStatus("playing")
    currentWordRef.current = clamped
    setCurrentWord(clamped)
    trackerStart()

    setTimeout(() => {
      internalStopRef.current = false
      synth.speak(utterance)
    }, 60)
  }, [])

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
      trackerPause()
    } else if (statusRef.current === "paused") {
      synth.resume()
      statusRef.current = "playing"
      setStatus("playing")
    } else {
      speakFrom(currentWordRef.current >= 0 ? currentWordRef.current : 0)
    }
  }, [speakFrom])

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
    trackerStop()
    statusRef.current = "idle"
    setStatus("idle")
    currentWordRef.current = -1
    setCurrentWord(-1)
  }, [])

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

  // Cancel speech on unmount.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

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
