"use client"

import { useEffect, useState } from "react"
import { AudioLines, TriangleAlert } from "lucide-react"
import { useSpeech } from "@/hooks/use-speech"
import { SAMPLE_TEXT, SAMPLE_TITLE } from "@/lib/sample-text"
import { VoxifyHeader } from "@/components/voxify-header"
import { ReaderPanel } from "@/components/reader-panel"
import { PlaybackBar } from "@/components/playback-bar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"

export function VoxifyApp() {
  const [title, setTitle] = useState(SAMPLE_TITLE)
  const [text, setText] = useState(SAMPLE_TEXT)
  const [mode, setMode] = useState<"read" | "edit">("read")
  const [draft, setDraft] = useState(SAMPLE_TEXT)
  const [draftTitle, setDraftTitle] = useState(SAMPLE_TITLE)

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
  } = useSpeech(text)

  // Reset playback whenever the source text changes.
  useEffect(() => {
    stop()
  }, [text, stop])

  const handleToggleMode = () => {
    if (mode === "read") {
      stop()
      setDraft(text)
      setDraftTitle(title)
      setMode("edit")
    } else {
      setText(draft)
      setTitle(draftTitle.trim() || "Untitled")
      setMode("read")
    }
  }

  const handlePlayPause = () => {
    if (status === "playing") {
      pause()
    } else {
      play()
    }
  }

  const progress =
    words.length > 0 ? Math.round((Math.max(0, currentWord) / words.length) * 100) : 0

  if (!supported) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold">Text-to-speech not supported</h1>
        <p className="max-w-sm text-muted-foreground">
          Your browser does not support the Web Speech API. Try the latest version of
          Chrome, Edge, or Safari to use VOXYFI.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <VoxifyHeader mode={mode} onToggleMode={handleToggleMode} wordCount={words.length} />

      {mode === "edit" ? (
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <label htmlFor="title" className="text-sm font-medium text-muted-foreground">
            Title
          </label>
          <Input
            id="title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Give your text a title"
            className="mt-2 h-12 text-lg font-medium"
          />

          <label
            htmlFor="content"
            className="mt-6 block text-sm font-medium text-muted-foreground"
          >
            Text to read
          </label>
          <Textarea
            id="content"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste an article, document, or any text you want read aloud..."
            className="mt-2 min-h-[50vh] resize-y font-serif text-lg leading-relaxed"
          />

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {draft.trim() ? draft.trim().split(/\s+/).length.toLocaleString() : 0} words
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft("")
                  setDraftTitle("")
                }}
              >
                Clear
              </Button>
              <Button onClick={handleToggleMode} className="gap-2">
                <AudioLines className="h-4 w-4" />
                Save &amp; listen
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <ReaderPanel
            title={title}
            text={text}
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
