"use client"

import { useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Play, Pause, RotateCcw, X, FileText } from "lucide-react"
import { usePlayer } from "@/components/player-provider"
import { cn } from "@/lib/utils"

const RATES = [1, 1.25, 1.5, 1.75, 2]

export function MiniPlayer() {
  const pathname = usePathname()
  const { track, status, currentWord, totalWords, rate, toggle, rewindWords, setRate, close, stop } =
    usePlayer()

  // The full listen page owns its own speech engine; pause the mini-player
  // there to avoid two synthesizers fighting over the audio channel.
  const onListenRoute = pathname?.startsWith("/app/listen")
  useEffect(() => {
    if (onListenRoute) stop()
  }, [onListenRoute, stop])

  if (!track || onListenRoute) return null

  const progress =
    totalWords > 0 ? Math.min(100, (Math.max(0, currentWord) / totalWords) * 100) : 0

  function cycleRate() {
    const idx = RATES.indexOf(rate)
    const next = RATES[(idx + 1) % RATES.length] ?? 1
    setRate(next)
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40">
      <div className="pointer-events-auto mx-auto max-w-2xl px-4">
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Link
              href={`/app/listen/${track.id}`}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {track.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {status === "playing"
                    ? "Playing"
                    : status === "paused"
                      ? "Paused"
                      : "Ready"}
                  {" · "}
                  {rate}x
                </span>
              </span>
            </Link>

            <button
              type="button"
              onClick={cycleRate}
              aria-label="Change speed"
              className="flex h-9 min-w-9 items-center justify-center rounded-full px-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-secondary"
            >
              {rate}x
            </button>

            <button
              type="button"
              onClick={() => rewindWords(20)}
              aria-label="Rewind"
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
            >
              <RotateCcw className="h-5 w-5" />
              <span className="absolute text-[8px] font-bold">10</span>
            </button>

            <button
              type="button"
              onClick={toggle}
              aria-label={status === "playing" ? "Pause" : "Play"}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
            >
              {status === "playing" ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 translate-x-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={close}
              aria-label="Close player"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="h-1 w-full bg-secondary">
            <div
              className={cn("h-full bg-primary transition-[width] duration-300")}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
