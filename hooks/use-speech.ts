"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { isHumanLikeVoice } from "@/lib/voices"

export type Word = {
  text: string
  start: number
  end: number
}

export type SpeechVoice = {
  uri: string
  name: string
  lang: string
  localService: boolean
}

type SpeechStatus = "idle" | "playing" | "paused"

/**
 * Tokenize text into words while preserving their character offsets so that we
 * can map SpeechSynthesis boundary events back to the rendered word spans.
 */
export function tokenize(text: string): Word[] {
  const words: Word[] = []
  const regex = /\S+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    words.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    })
  }
  return words
}

function findWordIndex(words: Word[], charIndex: number): number {
  let result = 0
  for (let i = 0; i < words.length; i++) {
    if (words[i].start <= charIndex) {
      result = i
    } else {
      break
    }
  }
  return result
}

export function useSpeech(text: string, initialWord = 0) {
  const [status, setStatus] = useState<SpeechStatus>("idle")
  // Seed from a saved resume position (word index) when provided.
  const [currentWord, setCurrentWord] = useState(initialWord > 0 ? initialWord : -1)
  const [rate, setRateState] = useState(1)
  const [voices, setVoices] = useState<SpeechVoice[]>([])
  const [voiceURI, setVoiceURIState] = useState<string>("")
  const [supported, setSupported] = useState(true)

  const words = useMemo(() => tokenize(text), [text])
  const wordsRef = useRef(words)
  wordsRef.current = words

  const rateRef = useRef(rate)
  rateRef.current = rate
  const voiceURIRef = useRef(voiceURI)
  voiceURIRef.current = voiceURI
  const statusRef = useRef<SpeechStatus>("idle")
  const currentWordRef = useRef(initialWord > 0 ? initialWord : -1)
  // Track whether the utterance "end" was triggered by us (stop/restart) so we
  // don't treat manual cancels as a natural completion.
  const internalStopRef = useRef(false)

  // Load available system voices.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false)
      return
    }

    const loadVoices = () => {
      const raw = window.speechSynthesis.getVoices()
      const mapped = raw.map((v) => ({
        uri: v.voiceURI,
        name: v.name,
        lang: v.lang,
        localService: v.localService,
      }))
      setVoices(mapped)
      setVoiceURIState((prev) => {
        if (prev) return prev
        // Prefer natural, human-like voices for the default selection.
        const pool = raw.filter((v) => isHumanLikeVoice(v.name))
        const candidates = pool.length > 0 ? pool : raw
        const preferred =
          candidates.find((v) => v.default && v.lang.startsWith("en")) ??
          candidates.find((v) => v.lang.startsWith("en")) ??
          candidates[0]
        return preferred ? preferred.voiceURI : ""
      })
    }

    loadVoices()
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices)
    }
  }, [])

  const speakFrom = useCallback((wordIndex: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const synth = window.speechSynthesis
    const allWords = wordsRef.current
    if (allWords.length === 0) return

    const clampedIndex = Math.max(0, Math.min(wordIndex, allWords.length - 1))
    const startOffset = allWords[clampedIndex].start
    const slice = text.slice(startOffset)
    if (!slice.trim()) return

    internalStopRef.current = true
    synth.cancel()

    const utterance = new SpeechSynthesisUtterance(slice)
    utterance.rate = rateRef.current
    const voice = synth.getVoices().find((v) => v.voiceURI === voiceURIRef.current)
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }

    utterance.onboundary = (event) => {
      if (event.name === "sentence") return
      const globalIndex = startOffset + event.charIndex
      const idx = findWordIndex(wordsRef.current, globalIndex)
      currentWordRef.current = idx
      setCurrentWord(idx)
    }

    utterance.onend = () => {
      if (internalStopRef.current) {
        internalStopRef.current = false
        return
      }
      statusRef.current = "idle"
      setStatus("idle")
      currentWordRef.current = -1
      setCurrentWord(-1)
    }

    statusRef.current = "playing"
    setStatus("playing")
    currentWordRef.current = clampedIndex
    setCurrentWord(clampedIndex)

    // Defer so the cancel() above fully settles before speaking.
    setTimeout(() => {
      internalStopRef.current = false
      synth.speak(utterance)
    }, 60)
  }, [text])

  const play = useCallback(() => {
    if (typeof window === "undefined") return
    const synth = window.speechSynthesis
    if (statusRef.current === "paused") {
      synth.resume()
      statusRef.current = "playing"
      setStatus("playing")
      return
    }
    const startIndex = currentWordRef.current >= 0 ? currentWordRef.current : 0
    speakFrom(startIndex)
  }, [speakFrom])

  const pause = useCallback(() => {
    if (typeof window === "undefined") return
    window.speechSynthesis.pause()
    statusRef.current = "paused"
    setStatus("paused")
  }, [])

  const stop = useCallback(() => {
    if (typeof window === "undefined") return
    internalStopRef.current = true
    window.speechSynthesis.cancel()
    statusRef.current = "idle"
    setStatus("idle")
    currentWordRef.current = -1
    setCurrentWord(-1)
  }, [])

  const seekToWord = useCallback(
    (index: number) => {
      currentWordRef.current = index
      setCurrentWord(index)
      if (statusRef.current !== "idle") {
        speakFrom(index)
      }
    },
    [speakFrom],
  )

  const skip = useCallback(
    (delta: number) => {
      const base = currentWordRef.current >= 0 ? currentWordRef.current : 0
      const target = Math.max(0, Math.min(base + delta, wordsRef.current.length - 1))
      seekToWord(target)
    },
    [seekToWord],
  )

  const setRate = useCallback((value: number) => {
    setRateState(value)
    rateRef.current = value
    if (statusRef.current === "playing") {
      speakFrom(currentWordRef.current >= 0 ? currentWordRef.current : 0)
    }
  }, [speakFrom])

  const setVoiceURI = useCallback((uri: string) => {
    setVoiceURIState(uri)
    voiceURIRef.current = uri
    if (statusRef.current === "playing") {
      speakFrom(currentWordRef.current >= 0 ? currentWordRef.current : 0)
    }
  }, [speakFrom])

  // Stop speech if the text changes or component unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  return {
    status,
    currentWord,
    words,
    rate,
    voices,
    voiceURI,
    supported,
    play,
    pause,
    stop,
    skip,
    seekToWord,
    setRate,
    setVoiceURI,
  }
}
