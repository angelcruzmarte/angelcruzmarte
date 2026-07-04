"use client"

import { useEffect, useMemo } from "react"
import {
  Pause,
  Play,
  Square,
  SkipBack,
  SkipForward,
  Gauge,
  Check,
  Languages,
  Loader2,
} from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { baseLang, friendlyVoiceName, isHumanLikeVoice } from "@/lib/voices"
import { READING_LANGUAGES } from "@/lib/languages"
import type { SpeechVoice } from "@/hooks/use-speech"

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

type Props = {
  status: "idle" | "playing" | "paused"
  progress: number
  totalWords: number
  currentWord: number
  rate: number
  voices: SpeechVoice[]
  voiceURI: string
  /** Selected reading/translation language code ("en" = original). */
  readingLang: string
  /** Whether a translation request is in flight. */
  translating: boolean
  /** Whether the user may translate (premium). */
  canTranslate: boolean
  /** Error surfaced from a failed/blocked translation. */
  readingError: string | null
  onReadingLangChange: (code: string) => void
  onPlayPause: () => void
  onStop: () => void
  onSkip: (delta: number) => void
  onSeek: (index: number) => void
  onRateChange: (value: number) => void
  onVoiceChange: (uri: string) => void
}

export function PlaybackBar({
  status,
  progress,
  totalWords,
  currentWord,
  rate,
  voices,
  voiceURI,
  readingLang,
  translating,
  canTranslate,
  readingError,
  onReadingLangChange,
  onPlayPause,
  onStop,
  onSkip,
  onSeek,
  onRateChange,
  onVoiceChange,
}: Props) {
  const isPlaying = status === "playing"

  // Only expose natural, human-like voices.
  const humanVoices = useMemo(
    () => voices.filter((v) => isHumanLikeVoice(v.name)),
    [voices],
  )

  // Voices that match the current reading language; fall back to all human
  // voices when the device has none installed for that language.
  const voicesForLang = useMemo(() => {
    const match = humanVoices.filter(
      (v) => baseLang(v.lang) === baseLang(readingLang),
    )
    return match.length > 0 ? match : humanVoices
  }, [humanVoices, readingLang])

  // If the selected voice isn't in the human-like list (e.g. a novelty default),
  // switch to the first natural voice available.
  useEffect(() => {
    if (humanVoices.length === 0) return
    if (!humanVoices.some((v) => v.uri === voiceURI)) {
      onVoiceChange(humanVoices[0].uri)
    }
  }, [humanVoices, voiceURI, onVoiceChange])

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:p-4">
        {/* Progress scrubber */}
        <div className="flex items-center gap-3">
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {progress}%
          </span>
          <Slider
            value={[totalWords > 0 ? Math.max(0, currentWord) : 0]}
            min={0}
            max={Math.max(totalWords - 1, 1)}
            step={1}
            onValueChange={(v) => onSeek(Array.isArray(v) ? v[0] : v)}
            aria-label="Reading progress"
            className="flex-1"
          />
          <span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">
            {Math.max(0, currentWord)}/{totalWords}
          </span>
        </div>

        {/* Language (translation) + voice selectors */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5">
            {translating ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <Languages className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Select
              value={readingLang}
              onValueChange={(value) => onReadingLangChange((value as string) ?? "en")}
              disabled={translating || !canTranslate}
            >
              <SelectTrigger className="h-9 flex-1 text-sm" aria-label="Language">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                {READING_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Select
            value={voiceURI}
            onValueChange={(value) => onVoiceChange((value as string) ?? "")}
            disabled={voicesForLang.length === 0}
          >
            <SelectTrigger className="h-9 flex-1 text-sm" aria-label="Voice">
              <SelectValue placeholder="Voice" />
            </SelectTrigger>
            <SelectContent>
              {voicesForLang.map((v) => (
                <SelectItem key={v.uri} value={v.uri}>
                  {friendlyVoiceName(v.name, v.lang)}
                </SelectItem>
              ))}
              {humanVoices.length === 0 && (
                <SelectItem value="none" disabled>
                  No voices available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {!canTranslate && (
          <p className="mt-2 text-xs text-muted-foreground">
            Translation to other languages is a premium feature.
          </p>
        )}
        {readingError && (
          <p className="mt-2 text-xs text-destructive" role="alert">
            {readingError}
          </p>
        )}

        {/* Transport controls */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1" />

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSkip(-10)}
              aria-label="Skip back"
              className="h-10 w-10"
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              size="icon"
              onClick={onPlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-12 w-12 rounded-full"
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" />
              ) : (
                <Play className="h-6 w-6 translate-x-0.5" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => onSkip(10)}
              aria-label="Skip forward"
              className="h-10 w-10"
            >
              <SkipForward className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              aria-label="Stop"
              disabled={status === "idle"}
              className="h-10 w-10"
            >
              <Square className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-1 justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "secondary" }),
                  "h-9 gap-1.5 px-3 tabular-nums",
                )}
              >
                <Gauge className="h-4 w-4" />
                {rate}x
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-32">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Speed</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {SPEEDS.map((speed) => (
                  <DropdownMenuItem
                    key={speed}
                    onClick={() => onRateChange(speed)}
                    className="justify-between tabular-nums"
                  >
                    {speed}x
                    <Check
                      className={cn(
                        "h-4 w-4",
                        rate === speed ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  )
}
