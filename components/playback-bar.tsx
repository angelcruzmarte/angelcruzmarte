"use client"

import {
  Pause,
  Play,
  Square,
  SkipBack,
  SkipForward,
  Gauge,
  Check,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
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
  onPlayPause,
  onStop,
  onSkip,
  onSeek,
  onRateChange,
  onVoiceChange,
}: Props) {
  const isPlaying = status === "playing"
  const englishVoices = voices.filter((v) => v.lang.startsWith("en"))
  const otherVoices = voices.filter((v) => !v.lang.startsWith("en"))

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6">
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

        {/* Controls */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Select
              value={voiceURI}
              onValueChange={(value) => onVoiceChange((value as string) ?? "")}
            >
              <SelectTrigger className="h-9 w-full max-w-[220px] text-sm">
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {englishVoices.length > 0 &&
                  englishVoices.map((v) => (
                    <SelectItem key={v.uri} value={v.uri}>
                      {v.name}
                    </SelectItem>
                  ))}
                {otherVoices.map((v) => (
                  <SelectItem key={v.uri} value={v.uri}>
                    {v.name} ({v.lang})
                  </SelectItem>
                ))}
                {voices.length === 0 && (
                  <SelectItem value="none" disabled>
                    No voices available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

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
                <DropdownMenuLabel>Speed</DropdownMenuLabel>
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
