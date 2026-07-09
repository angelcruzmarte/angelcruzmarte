"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, TriangleAlert, FileText } from "lucide-react"
import { useSpeech } from "@/hooks/use-speech"
import { ReaderPanel } from "@/components/reader-panel"
import { PlaybackBar } from "@/components/playback-bar"
import { PremiumNarration } from "@/components/premium-narration"
import { ReaderAiTools } from "@/components/reader-ai-tools"
import { DownloadAudioButton } from "@/components/download-audio-button"
import {
  OriginalDocumentView,
  isViewableOriginal,
} from "@/components/original-document-view"
import {
  PdfFollowAlong,
  type PdfFollowAlongHandle,
} from "@/components/pdf-follow-along"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { baseLang, voiceQualityScore } from "@/lib/voices"
import { normalizeLang, isSupportedLang, languageLabel } from "@/lib/languages"
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
  /** Blob URL of the original uploaded file (PDF/image), if preserved. */
  originalUrl?: string | null
  /** MIME type of the original file. */
  originalMime?: string | null
  /** How the document was created ("file", "ai", "url", …). */
  sourceType?: string | null
  /** Detected language (ISO/BCP-47) of the document content. */
  sourceLang?: string | null
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
  originalUrl,
  originalMime,
  sourceType,
  sourceLang,
}: Props) {
  // The reader always uses the premium AI voice when the user has access; there
  // is no device-voice option. Non-premium users fall back to device speech.
  const mode = premium ? "premium" : "standard"

  // Whether we can render the real uploaded pages (PDFs / image scans).
  const hasOriginal =
    Boolean(originalUrl) && isViewableOriginal(originalMime, originalUrl)
  // A file that was uploaded before we started preserving the original pages.
  // These can't show the real-page follow-along until re-uploaded.
  const needsReupload = sourceType === "file" && !originalUrl
  // When the original pages are available we always show them (Speechify-style
  // page follow-along). There is no Page/Text toggle — plain text is only used
  // as a fallback for documents without a viewable original.
  const view = hasOriginal ? "original" : "text"
  // `originalUrl` already points at the ownership-checked serving route.
  const originalSrc = originalUrl ?? ""
  const isPdf =
    originalMime === "application/pdf" || /\.pdf(\?|$)/i.test(originalSrc)

  // Follow-along on the real PDF pages: text is extracted client-side from the
  // PDF so device-voice highlighting maps 1:1 to the rendered word spans.
  const [pdfText, setPdfText] = useState<string | null>(null)
  const [pdfWordCount, setPdfWordCount] = useState(0)
  const [pdfFailed, setPdfFailed] = useState(false)
  const [pdfPage, setPdfPage] = useState({ current: 1, total: 0 })
  // Premium AI narration reports an approximate word position we map by fraction.
  const [premiumPos, setPremiumPos] = useState({ word: -1, total: 0 })
  // Whether the premium AI voice is actively playing (gates auto-scroll so it
  // never yanks the user back to the top when paused/idle).
  const [premiumPlaying, setPremiumPlaying] = useState(false)
  const usePdfFollow = isPdf && !pdfFailed && Boolean(originalSrc)
  const pdfRef = useRef<PdfFollowAlongHandle>(null)

  // Reading/translation language for the device-voice path. "original" narrates
  // the document as-is; any other value is a target language we translate INTO.
  const [readingLang, setReadingLang] = useState("original")
  const [translations, setTranslations] = useState<Record<string, string>>({})
  const [translating, setTranslating] = useState(false)
  const [readingError, setReadingError] = useState<string | null>(null)

  // Reader's device/browser language, normalized to a two-letter code.
  const [deviceLang, setDeviceLang] = useState("")
  useEffect(() => {
    setDeviceLang(normalizeLang(navigator.language))
  }, [])

  const sourceNorm = sourceLang ? normalizeLang(sourceLang) : ""
  // Offer translation only when the document language is known, the device
  // language is supported, and the two differ.
  const canTranslate =
    premium &&
    Boolean(sourceNorm) &&
    Boolean(deviceLang) &&
    isSupportedLang(deviceLang) &&
    deviceLang !== sourceNorm

  const activeContent = useMemo(
    () =>
      readingLang === "original"
        ? // Prefer the client-extracted PDF text so highlighting lines up with
          // the rendered pages; fall back to server text until it's parsed.
          usePdfFollow && pdfText
          ? pdfText
          : content
        : translations[readingLang] ?? content,
    [readingLang, translations, content, usePdfFollow, pdfText],
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

  const pickVoiceFor = useCallback(
    (langCode: string) => {
      // Choose the clearest available device voice for the target language.
      const matches = voices
        .filter((v) => baseLang(v.lang) === baseLang(langCode))
        .sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a))
      if (matches[0]) setVoiceURI(matches[0].uri)
    },
    [voices, setVoiceURI],
  )

  // Translate the document into a target language for device narration and pick
  // a matching device voice. Translation is a premium capability.
  const translateTo = useCallback(
    async (code: string) => {
      stop()
      setReadingError(null)

      // Already translated: switch instantly.
      if (translations[code]) {
        setReadingLang(code)
        pickVoiceFor(code)
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
    [translations, content, stop, pickVoiceFor],
  )

  // Toggle between the document's original language and an automatic
  // translation into the reader's device language. No manual language menu.
  const toggleTranslation = useCallback(() => {
    if (readingLang === "original") {
      void translateTo(deviceLang)
    } else {
      stop()
      setReadingLang("original")
      setVoiceURI("") // let the browser default voice handle the source language
    }
  }, [readingLang, deviceLang, translateTo, stop, setVoiceURI])

  // Automatically translate into the device language once, the first time we
  // detect it differs from the document's language.
  const autoTranslatedRef = useRef(false)
  useEffect(() => {
    if (autoTranslatedRef.current) return
    if (canTranslate) {
      autoTranslatedRef.current = true
      void translateTo(deviceLang)
    }
  }, [canTranslate, deviceLang, translateTo])

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
    if (status === "playing" && readingLang === "original")
      persistProgress(currentWord)
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

  // Speechify-style immersive experience: the real document page is the hero
  // surface and a compact player + AI tools dock to the bottom of the screen.
  const immersive = hasOriginal && view === "original"
  const aiTools = premium ? <ReaderAiTools text={content} /> : null

  // Which word to highlight on the rendered PDF pages.
  // - Device voice reads the PDF text directly, so currentWord maps 1:1.
  // - Premium AI has no word timing, so we map its approximate position onto
  //   the PDF word list by fraction (still auto-scrolls through to the end).
  const pdfActiveWord = (() => {
    if (!usePdfFollow || readingLang !== "original") return -1
    if (premium && mode === "premium") {
      if (premiumPos.total <= 0 || pdfWordCount <= 0) return -1
      return Math.min(
        pdfWordCount - 1,
        Math.round((premiumPos.word / premiumPos.total) * pdfWordCount),
      )
    }
    return currentWord
  })()

  // Overall playback progress (0..1) for the robust, word-independent scroll
  // engine. This guarantees the document scrolls through to the end as the
  // premium voice plays, even if the two word lists don't align perfectly.
  const premiumFraction =
    premium && mode === "premium" && premiumPlaying && premiumPos.total > 0
      ? Math.min(1, premiumPos.word / premiumPos.total)
      : -1

  if (immersive) {
    return (
      <div className="flex min-h-[100dvh] flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-md sm:px-6">
          <Link
            href={backHref}
            aria-label={backLabel}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "h-9 w-9 shrink-0",
            )}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{title}</h1>
            {usePdfFollow && pdfPage.total > 0 && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Page {pdfPage.current} of {pdfPage.total}
              </p>
            )}
          </div>
        </header>

        <main className="flex-1 pb-44 sm:pb-40">
          {usePdfFollow ? (
            <PdfFollowAlong
              ref={pdfRef}
              src={originalSrc}
              activeWord={pdfActiveWord}
              scrollFraction={premiumFraction}
              onWords={(text, count) => {
                setPdfText(text)
                setPdfWordCount(count)
              }}
              onWordClick={(i) => {
                // Word taps seek the device-voice engine (exact mapping).
                if (!(premium && mode === "premium")) seekToWord(i)
              }}
              onPageChange={(current, total) =>
                setPdfPage({ current, total })
              }
              onError={() => setPdfFailed(true)}
              className="mx-auto max-w-2xl"
            />
          ) : (
            <OriginalDocumentView
              src={originalSrc}
              mime={originalMime}
              title={title}
              immersive
            />
          )}
        </main>

        {premium && mode === "premium" ? (
          <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6">
            <PremiumNarration
              text={content}
              title={title}
              sourceLang={sourceLang}
              showReader={false}
              immersive
              topSlot={aiTools}
              onActiveWord={(word, total) => setPremiumPos({ word, total })}
              onPlayingChange={setPremiumPlaying}
            />
          </div>
        ) : (
          <PlaybackBar
            status={status}
            progress={progress}
            totalWords={words.length}
            currentWord={currentWord}
            rate={rate}
            voices={voices}
            voiceURI={voiceURI}
            translating={translating}
            canTranslate={canTranslate}
            isTranslated={readingLang !== "original"}
            deviceLangLabel={deviceLang ? languageLabel(deviceLang) : ""}
            sourceLangLabel={sourceNorm ? languageLabel(sourceNorm) : ""}
            readingError={readingError}
            onToggleTranslation={toggleTranslation}
            onPlayPause={handlePlayPause}
            onStop={stop}
            onSkip={skip}
            onSeek={seekToWord}
            onRateChange={setRate}
            onVoiceChange={setVoiceURI}
            topSlot={aiTools}
          />
        )}
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

      {needsReupload && (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-pretty">
              This document was added before the read-along page view was
              available, so only the text is saved.{" "}
              <Link
                href="/app/upload"
                className="font-medium text-primary underline underline-offset-2"
              >
                Re-upload the file
              </Link>{" "}
              to follow along on the original pages.
            </p>
          </div>
        </div>
      )}

      {/* AI tools docked into the reader, matching the immersive experience. */}
      {aiTools && (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <div className="rounded-2xl border border-border bg-card p-1.5">
            {aiTools}
          </div>
        </div>
      )}

      {premium && mode === "premium" && (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <PremiumNarration
            text={content}
            title={title}
            sourceLang={sourceLang}
            showReader={view === "text"}
          />
        </div>
      )}

      {mode === "standard" && (
        <>
          {view === "text" && (
            <ReaderPanel
              title={title}
              text={activeContent}
              words={words}
              currentWord={currentWord}
              onWordClick={seekToWord}
            />
          )}

          <PlaybackBar
            status={status}
            progress={progress}
            totalWords={words.length}
            currentWord={currentWord}
            rate={rate}
            voices={voices}
            voiceURI={voiceURI}
            translating={translating}
            canTranslate={canTranslate}
            isTranslated={readingLang !== "original"}
            deviceLangLabel={deviceLang ? languageLabel(deviceLang) : ""}
            sourceLangLabel={sourceNorm ? languageLabel(sourceNorm) : ""}
            readingError={readingError}
            onToggleTranslation={toggleTranslation}
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
