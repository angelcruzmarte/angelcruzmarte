"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, TriangleAlert, Sparkles, AudioLines } from "lucide-react"
import { useSpeech } from "@/hooks/use-speech"
import { ReaderPanel } from "@/components/reader-panel"
import { PlaybackBar } from "@/components/playback-bar"
import { PremiumNarration } from "@/components/premium-narration"
import { DownloadAudioButton } from "@/components/download-audio-button"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { baseLang, voiceQualityScore } from "@/lib/voices"
import { translateText } from "@/app/actions/ai"
import {
  trackerAddWords,
  trackerPause,
  trackerStart,
} from "@/lib/listening-tracker"

type Props = {
  title: string
  author?: string | null
  content: string
  backHref?: string
  backLabel?: string
  /** Whether the current user has access to premium AI narration. */
  premium?: boolean
  /** Saved resume position (word index) to start from. */
  initialWord?: number
  /** When set, playback progress is persisted for this book. */
  bookId?: number
  /** When set, playback progress is persisted for this document. */
  documentId?: number
  /** Whether to show the premium offline MP3 download control. */
  allowDownload?: boolean
}

export function ListenPlayer({
  title,
  content,
  backHref = "/app/library",
  backLabel = "Library",
  premium = false,
  initialWord = 0,
  bookId,
  documentId,
  allowDownload = false,
}: Props) {
  const [mode, setMode] = useState<"standard" | "premium">(
    premium ? "premium" : "standard",
  )

  // Reading/translation language for the device-voice path. "en" = original.
  const [readingLang, setReadingLang] = useState("en")
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState(false)
  const [readingError, setReadingError] = useState<string | null>(null)

  const activeContent = useMemo(
    () => (readingLang === "en" ? content : translations[readingLang] ?? content),
    [readingLang, translations, content],
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
  } = useSpeech(activeContent, initialWord)

  // Translate the document for device narration and pick a matching device
  // voice. Only English (original) is available without a subscription.
  const handleReadingLangChange = useCallback(
    async (code: string) => {
      if (code === readingLang) return
      stop()
      setReadingError(null)

      const pickVoiceFor = (langCode: string) => {
        // Choose the clearest available voice for the target language.
        const matches = voices
          .filter((v) => baseLang(v.lang) === baseLang(langCode))
          .sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))
        if (matches[0]) setVoiceURI(matches[0].uri)
      }

      // Original, or an already-translated language: switch instantly.
      if (code === "en" || translations[code]) {
        setReadingLang(code)
        if (code !== "en") pickVoiceFor(code)
        return
      }

      setTranslating(true)
      try {
        const res = await translateText(content, code)
        if (res.error) {
          setReadingError(res.error)
          return
        }
        setTranslations((prev) => ({ ...prev, [code]: res.translated }))
        setReadingLang(code)
        pickVoiceFor(code)
      } catch {
        setReadingError(
          "Could not translate this text right now. Please try again shortly.",
        )
      } finally {
        setTranslating(false)
      }
    },
    [readingLang, translations, content, voices, stop, setVoiceURI],
  )

  // Debounced persistence of the resume position.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initialWord)

  const persistProgress = useCallback(
    (wordIndex: number) => {
      if (wordIndex < 0) return
      if (Math.abs(wordIndex - lastSaved.current) < 5) return
      lastSaved.current = wordIndex
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        try {
          if (bookId !== undefined) {
            const { saveBookProgress } = await import("@/app/actions/books")
            await saveBookProgress(bookId, wordIndex)
          } else if (documentId !== undefined) {
            const { updateProgress } = await import(
              "@/app/actions/documents"
            )
            await updateProgress(documentId, wordIndex)
          }
        } catch {
          // Progress saving is best-effort; ignore failures.
        }
      }, 1200)
    },
    [bookId, documentId],
  )

  useEffect(() => {
    // Only persist resume position for the original text; translated word
    // indices don't map back to the stored document.
    if (status === "playing" && readingLang === "en") persistProgress(currentWord)
  }, [currentWord, status, persistProgress, readingLang])

  // Feed listening statistics: run a timer while playing and count word
  // advances as the highlight moves forward. This covers the device-voice path;
  // the premium AI player uses the shared player-provider engine.
  useEffect(() => {
    if (status === "playing") trackerStart()
    else trackerPause()
  }, [status])

  const lastTrackedWord = useRef(-1)
  useEffect(() => {
    if (status !== "playing") return
    const prev = lastTrackedWord.current
    if (currentWord > prev) trackerAddWords(currentWord - prev)
    lastTrackedWord.current = currentWord
  }, [currentWord, status])

  // Flush stats when leaving the page.
  useEffect(() => {
    return () => {
      trackerPause()
    }
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      stop()
    }
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
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 pt-6 sm:px-6">
        <Link
          href={backHref}
          className={buttonVariants({ variant: "ghost", size: "sm" }) + " gap-1.5"}
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        {allowDownload && (
          <DownloadAudioButton title={title} text={content} premium={premium} />
        )}
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
          <PremiumNarration text={content} title={title} />
        </div>
      )}

      {mode === "standard" && (
        <>
          <ReaderPanel
            title={title}
            text={activeContent}
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
            readingLang={readingLang}
            translating={translating}
            canTranslate={premium}
            readingError={readingError}
            onReadingLangChange={handleReadingLangChange}
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
