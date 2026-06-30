"use client"

import { useEffect } from "react"
import Link from "next/link"
import { ArrowLeft, TriangleAlert } from "lucide-react"
import { useSpeech } from "@/hooks/use-speech"
import { ReaderPanel } from "@/components/reader-panel"
import { PlaybackBar } from "@/components/playback-bar"
import { buttonVariants } from "@/components/ui/button"

type Props = {
  title: string
  author?: string | null
  content: string
}

export function ListenPlayer({ title, author, content }: Props) {
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
          version of Chrome, Edge, or Safari to listen on Voxify.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <Link
          href="/library"
          className={buttonVariants({ variant: "ghost", size: "sm" }) + " gap-1.5"}
        >
          <ArrowLeft className="h-4 w-4" />
          Library
        </Link>
      </div>

      <ReaderPanel
        title={author ? `${title}` : title}
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
    </div>
  )
}
