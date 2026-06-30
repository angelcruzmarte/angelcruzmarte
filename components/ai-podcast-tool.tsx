"use client"

import { useEffect, useRef, useState } from "react"
import { AudioLines, Loader2, Pause, Play } from "lucide-react"
import { generatePodcast, type PodcastResult } from "@/app/actions/ai"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export function AIPodcastTool() {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PodcastResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const cancelRef = useRef(false)

  useEffect(() => {
    return () => {
      cancelRef.current = true
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  async function run() {
    if (!input.trim() || loading) return
    stopPlayback()
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await generatePodcast(input))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  function stopPlayback() {
    cancelRef.current = true
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setPlaying(false)
    setActiveIndex(-1)
  }

  function playPodcast() {
    if (!result || typeof window === "undefined" || !("speechSynthesis" in window))
      return
    cancelRef.current = false
    setPlaying(true)
    const voices = window.speechSynthesis.getVoices()
    const englishVoices = voices.filter((v) => v.lang.startsWith("en"))
    const hostVoice = englishVoices[0] ?? voices[0]
    const guestVoice = englishVoices[1] ?? englishVoices[0] ?? voices[0]

    const speakAt = (i: number) => {
      if (cancelRef.current || i >= result.segments.length) {
        setPlaying(false)
        setActiveIndex(-1)
        return
      }
      setActiveIndex(i)
      const seg = result.segments[i]
      const u = new SpeechSynthesisUtterance(seg.line)
      const isHost = seg.speaker.toLowerCase().includes("host")
      const v = isHost ? hostVoice : guestVoice
      if (v) {
        u.voice = v
        u.lang = v.lang
      }
      u.rate = 1
      u.pitch = isHost ? 1 : 0.9
      u.onend = () => speakAt(i + 1)
      u.onerror = () => speakAt(i + 1)
      window.speechSynthesis.speak(u)
    }
    speakAt(0)
  }

  return (
    <div className="space-y-4">
      <Textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Paste text to turn into a two-host podcast conversation…"
        rows={8}
      />
      <Button onClick={run} disabled={loading || !input.trim()} className="w-full" size="lg">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><AudioLines className="h-4 w-4" /> Generate podcast</>}
      </Button>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-balance">{result.title}</h3>
            <Button
              size="sm"
              variant={playing ? "secondary" : "default"}
              onClick={playing ? stopPlayback : playPodcast}
              className="shrink-0 gap-1.5"
            >
              {playing ? (
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
          <div className="space-y-3">
            {result.segments.map((seg, i) => {
              const isHost = seg.speaker.toLowerCase().includes("host")
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
