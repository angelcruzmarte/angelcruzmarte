"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, TriangleAlert, Sparkles, AudioLines } from "lucide-react"
import { useSpeech } from "@/hooks/use-speech"
import { ReaderPanel } from "@/components/reader-panel"
import { PlaybackBar } from "@/components/playback-bar"
import { PremiumNarration } from "@/components/premium-narration"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  author?: string | null
  content: string
  backHref?: string
  backLabel?: string
  /** Whether the current user has access to premium AI narration. */
  premium?: boolean
}

export function ListenPlayer({
  title,
  author,
  content,
  backHref = "/library",
  backLabel = "Library",
  premium = false,
}: Props) {
  const [mode, setMode] = useState<"standard" | "premium">(
    premium ? "premium" : "standard",
  )
  const {
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
  } = useSpeech(content)

  useEffect(() => {
    return () => stop()
  }, [stop])

  const progress =
    words.length > 0
      ? Math.round((Math.max(0, currentWord) / words.length) * 100)
      : 0

  const handlePlayPause = () => {
    if (status === "playing") pause()
    else play()
  }

  if (!supported) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Text-to-speech not supported</h1>
        <p className="max-w-sm text-muted-foreground">
          Your browser does not support the Web Speech API. Try the latest
          version of Chrome, Edge, or Safari to listen on VOXYFI.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <Link
          href={backHref}
          className={buttonVariants({ variant: "ghost", size: "sm" }) + " gap-1.5"}
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      </div>

      {premium && (
        <div className="mx-auto mt-4 flex max-w-3xl gap-1 rounded-full border border-border bg-muted/50 p-1 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => {
              stop()
              setMode("premium")
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "premium"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Sparkles className="h-4 w-4" />
            AI voice
          </button>
          <button
            type="button"
            onClick={() => setMode("standard")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              mode === "standard"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <AudioLines className="h-4 w-4" />
            Device voice
          </button>
        </div>
      )}

      {premium && mode === "premium" && (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <PremiumNarration text={content} />
          <ReaderPanel
            title={title}
            text={content}
            words={words}
            currentWord={-1}
            onWordClick={() => {}}
          />
        </div>
      )}

      {mode === "standard" && (
        <>
          <ReaderPanel
            title={title}
            text={content}
            words={words}
            currentWord={currentWord}
            onWordClick={seekToWord}
          />

          <PlaybackBar
            status={status}
            progress={progress}
            totalWords={words.length}
            currentWord={currentWord}
            rate={rate}
            voices={voices}
            voiceURI={voiceURI}
            onPlayPause={handlePlayPause}
            onStop={stop}
            onSkip={skip}
            onSeek={seekToWord}
            onRateChange={setRate}
            onVoiceChange={setVoiceURI}
          />
        </>
      )}
    </div>
  )
}
