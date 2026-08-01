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
import {
  baseLang,
  friendlyVoiceName,
  isHumanLikeVoice,
  voiceQualityScore,
} from "@/lib/voices"
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
  /** Whether a translation request is in flight. */
  translating: boolean
  /** Whether automatic translation is available (premium + different langs). */
  canTranslate: boolean
  /** Whether the content is currently being narrated as a translation. */
  isTranslated: boolean
  /** Human label of the reader's device language (translation target). */
  deviceLangLabel: string
  /** Human label of the document's own language. */
  sourceLangLabel: string
  /** Error surfaced from a failed/blocked translation. */
  readingError: string | null
  onToggleTranslation: () => void
  onPlayPause: () => void
  onStop: () => void
  onSkip: (delta: number) => void
  onSeek: (index: number) => void
  onRateChange: (value: number) => void
  onVoiceChange: (uri: string) => void
  /** When true, render only the card (no fixed dock) so a parent can position it. */
  embedded?: boolean
  /** Optional content rendered above the controls (e.g. the AI tools row). */
  topSlot?: React.ReactNode
}

export function PlaybackBar({
  status,
  progress,
  totalWords,
  currentWord,
  rate,
  voices,
  voiceURI,
  translating,
  canTranslate,
  isTranslated,
  deviceLangLabel,
  sourceLangLabel,
  readingError,
  onToggleTranslation,
  onPlayPause,
  onStop,
  onSkip,
  onSeek,
  onRateChange,
  onVoiceChange,
  embedded = false,
  topSlot,
}: Props) {
  const isPlaying = status === "playing"

  // Only expose natural, human-like voices, ordered by expected clarity so the
  // clearest, most premium-sounding options appear first.
  const humanVoices = useMemo(
    () =>
      voices
        .filter((v) => isHumanLikeVoice(v.name))
        .slice()
        .sort((a, b) => voiceQualityScore(b) - voiceQualityScore(a)),
    [voices],
  )

  // Prefer voices whose language matches the currently selected voice; fall
  // back to all natural voices. This keeps the picker relevant after an
  // automatic language switch without exposing a manual language menu.
  const selectedVoiceLang = useMemo(
    () => voices.find((v) => v.uri === voiceURI)?.lang,
    [voices, voiceURI],
  )
  const voicesForLang = useMemo(() => {
    if (!selectedVoiceLang) return humanVoices
    const match = humanVoices.filter(
      (v) => baseLang(v.lang) === baseLang(selectedVoiceLang),
    )
    return match.length > 0 ? match : humanVoices
  }, [humanVoices, selectedVoiceLang])

  // If the selected voice isn't in the human-like list (e.g. a novelty default),
  // switch to the first natural voice available.
  useEffect(() => {
    if (humanVoices.length === 0) return
    if (voiceURI && !humanVoices.some((v) => v.uri === voiceURI)) {
      onVoiceChange(humanVoices[0].uri)
    }
  }, [humanVoices, voiceURI, onVoiceChange])

  const card = (
    <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md sm:p-4">
      {topSlot && (
        <div className="mb-2 border-b border-border pb-2">{topSlot}</div>
      )}
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

        {/* Automatic translation status + voice selector */}
        <div className="mt-3 flex items-center gap-2">
          {canTranslate && (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {translating ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Languages className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">
                  {isTranslated
                    ? `Auto-translated to ${deviceLangLabel}`
                    : `In ${sourceLangLabel}`}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={onToggleTranslation}
                disabled={translating}
              >
                {isTranslated
                  ? `Original (${sourceLangLabel})`
                  : `Translate to ${deviceLangLabel}`}
              </Button>
            </div>
          )}

          <Select
            value={voiceURI}
            onValueChange={(value) => onVoiceChange((value as string) ?? "")}
            disabled={voicesForLang.length === 0}
          >
            <SelectTrigger
              className={cn("h-9 text-sm", canTranslate ? "w-[150px]" : "flex-1")}
              aria-label="Voice"
            >
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
  )

  if (embedded) return card

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6">
      {card}
    </div>
  )
}
