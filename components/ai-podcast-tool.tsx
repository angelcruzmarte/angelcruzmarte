"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AudioLines, ChevronDown, Loader2, Pause, Play } from "lucide-react"
import { generatePodcast, type PodcastResult } from "@/app/actions/ai"
import { generatePremiumSpeech } from "@/app/actions/speech"
import { PREMIUM_VOICES, getPremiumVoice } from "@/lib/voices"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { PodcastAudioActions } from "@/components/podcast-audio-actions"
import { VoiceAvatar } from "@/components/voice-avatar"
import { cn } from "@/lib/utils"

// Two distinct ultra-realistic voices make the two-host format feel natural.
const DEFAULT_HOST_VOICE = "el-sarah"
const DEFAULT_GUEST_VOICE = "el-brian"

function isHostSpeaker(speaker: string) {
  return speaker.toLowerCase().includes("host")
}

export function AIPodcastTool() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PodcastResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hostVoice, setHostVoice] = useState(DEFAULT_HOST_VOICE)
  const [guestVoice, setGuestVoice] = useState(DEFAULT_GUEST_VOICE)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Cache of generated audio URLs keyed by `${segmentIndex}:${voiceId}`.
  const cacheRef = useRef<Map<string, string>>(new Map())
  // Monotonic token used to cancel an in-flight playback loop.
  const playTokenRef = useRef(0)
  // Resolver for the segment currently awaiting playback, so stop() can unblock.
  const finishCurrentRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const el = new Audio()
    audioRef.current = el
    return () => {
      playTokenRef.current++
      el.pause()
      el.removeAttribute("src")
    }
  }, [])

  const voiceIdForSegment = useCallback(
    (i: number) => {
      const seg = result?.segments[i]
      if (!seg) return hostVoice
      return isHostSpeaker(seg.speaker) ? hostVoice : guestVoice
    },
    [result, hostVoice, guestVoice],
  )

  const fetchSegmentUrl = useCallback(
    async (i: number): Promise<string | null> => {
      const seg = result?.segments[i]
      if (!seg) return null
      const voice = voiceIdForSegment(i)
      const key = `${i}:${voice}`
      const cached = cacheRef.current.get(key)
      if (cached) return cached
      const res = await generatePremiumSpeech(seg.line, voice)
      if ("error" in res) throw new Error(res.error)
      cacheRef.current.set(key, res.url)
      return res.url
    },
    [result, voiceIdForSegment],
  )

  const stopPlayback = useCallback(() => {
    playTokenRef.current++
    const el = audioRef.current
    if (el) {
      el.pause()
      el.removeAttribute("src")
    }
    finishCurrentRef.current?.()
    finishCurrentRef.current = null
    setPlaying(false)
    setBuffering(false)
    setActiveIndex(-1)
  }, [])

  // Plays a single URL to completion; resolves on end/error or when cancelled.
  const playUrl = useCallback((el: HTMLAudioElement, url: string) => {
    return new Promise<void>((resolve) => {
      const done = () => {
        el.removeEventListener("ended", done)
        el.removeEventListener("error", done)
        finishCurrentRef.current = null
        resolve()
      }
      finishCurrentRef.current = done
      el.addEventListener("ended", done)
      el.addEventListener("error", done)
      el.src = url
      el.currentTime = 0
      void el.play().catch(() => {
        /* autoplay restrictions: resolve so the loop can advance */
        done()
      })
    })
  }, [])

  const playFrom = useCallback(
    async (start: number) => {
      if (!result) return
      const el = audioRef.current
      if (!el) return
      const token = ++playTokenRef.current
      setError(null)
      setPlaying(true)

      for (let i = start; i < result.segments.length; i++) {
        if (playTokenRef.current !== token) return
        setActiveIndex(i)
        setBuffering(true)
        let url: string | null = null
        try {
          url = await fetchSegmentUrl(i)
        } catch (e) {
          if (playTokenRef.current !== token) return
          setError(
            e instanceof Error
              ? e.message
              : "Could not generate audio. Please try again.",
          )
          stopPlayback()
          return
        }
        if (playTokenRef.current !== token) return
        setBuffering(false)
        if (!url) continue
        // Prefetch the next segment's audio while this one plays.
        if (i + 1 < result.segments.length) {
          void fetchSegmentUrl(i + 1).catch(() => {})
        }
        await playUrl(el, url)
      }

      if (playTokenRef.current === token) {
        setPlaying(false)
        setBuffering(false)
        setActiveIndex(-1)
      }
    },
    [result, fetchSegmentUrl, playUrl, stopPlayback],
  )

  async function run() {
    if (!input.trim() || loading) return
    stopPlayback()
    cacheRef.current.clear()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const r = await generatePodcast(input)
      if (r.error) setError(r.error)
      else setResult(r)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function changeHostVoice(v: string) {
    stopPlayback()
    setHostVoice(v)
  }

  function changeGuestVoice(v: string) {
    stopPlayback()
    setGuestVoice(v)
  }

  const hostPersona = getPremiumVoice(hostVoice)
  const guestPersona = getPremiumVoice(guestVoice)

  return (
    <div className="space-y-4">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste text to turn into a two-host podcast conversation…"
        rows={8}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <VoicePicker
          label="Host voice"
          value={hostVoice}
          onChange={changeHostVoice}
        />
        <VoicePicker
          label="Guest voice"
          value={guestVoice}
          onChange={changeGuestVoice}
        />
      </div>

      <Button
        onClick={run}
        disabled={loading || !input.trim()}
        className="w-full"
        size="lg"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <AudioLines className="h-4 w-4" /> Generate podcast
          </>
        )}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-balance">{result.title}</h3>
            <Button
              size="sm"
              variant={playing ? "secondary" : "default"}
              onClick={playing ? stopPlayback : () => playFrom(0)}
              className="shrink-0 gap-1.5"
            >
              {buffering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading
                </>
              ) : playing ? (
                <>
                  <Pause className="h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" /> Play
                </>
              )}
            </Button>
          </div>

          <div className="mb-4 flex items-center gap-4 text-xs text-muted-foreground">
            {hostPersona && (
              <span className="flex items-center gap-1.5">
                <VoiceAvatar
                  name={hostPersona.name}
                  image={hostPersona.image}
                  size={22}
                  alt=""
                />
                Host · {hostPersona.name}
              </span>
            )}
            {guestPersona && (
              <span className="flex items-center gap-1.5">
                <VoiceAvatar
                  name={guestPersona.name}
                  image={guestPersona.image}
                  size={22}
                  alt=""
                />
                Guest · {guestPersona.name}
              </span>
            )}
          </div>

          <div className="mb-4">
            <PodcastAudioActions
              segments={result.segments}
              hostVoice={hostVoice}
              guestVoice={guestVoice}
              title={result.title}
            />
          </div>

          <div className="space-y-3">
            {result.segments.map((seg, i) => {
              const isHost = isHostSpeaker(seg.speaker)
              return (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl px-3 py-2 transition-colors",
                    activeIndex === i
                      ? "bg-primary/10"
                      : isHost
                        ? "bg-secondary"
                        : "bg-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      isHost ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {seg.speaker}
                  </span>
                  <p className="mt-0.5 leading-relaxed">{seg.line}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function VoicePicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  // Backed by a real native <select> layered invisibly over the styled trigger.
  // The JS dropdown (base-ui) proved unreliable on iOS Safari when nested inside
  // a portal — taps on options wouldn't register, so the voice never switched. A
  // native <select> uses the OS picker, which is 100% reliable for touch, while
  // we keep the avatar + name styling in the visible trigger.
  const persona = getPremiumVoice(value)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="relative">
        <div className="flex h-12 items-center gap-2 rounded-lg border border-input bg-background px-3 pr-9 text-sm">
          {persona && (
            <VoiceAvatar
              name={persona.name}
              image={persona.image}
              size={24}
              alt=""
            />
          )}
          <span className="truncate font-medium">
            {persona?.name ?? "Select a voice"}
          </span>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <select
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {PREMIUM_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.tagline}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
