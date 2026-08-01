"use client"

import { useEffect, useState } from "react"

/**
 * Live "ends in Xd Xh Xm Xs" countdown for a time-limited promotion.
 * Renders nothing once the deadline has passed (or if no deadline is given),
 * so an expired promo never lingers on the page.
 */
export function PromoCountdown({ endsAt }: { endsAt: string | null }) {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!endsAt) return
    const target = new Date(endsAt).getTime()
    const tick = () => setRemaining(Math.max(0, target - Date.now()))
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [endsAt])

  if (!endsAt || remaining === null || remaining <= 0) return null

  const totalSeconds = Math.floor(remaining / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: { label: string; value: number }[] = [
    { label: "d", value: days },
    { label: "h", value: hours },
    { label: "m", value: minutes },
    { label: "s", value: seconds },
  ]

  return (
    <div
      className="mt-3 flex items-center justify-center gap-2"
      role="timer"
      aria-label="Time left before the offer ends"
    >
      {parts.map((p) => (
        <div
          key={p.label}
          className="flex min-w-[3rem] flex-col items-center rounded-lg bg-primary px-2 py-1.5 text-primary-foreground"
        >
          <span className="text-lg font-bold tabular-nums leading-none">
            {p.value.toString().padStart(2, "0")}
          </span>
          <span className="mt-0.5 text-[10px] font-medium uppercase opacity-80">
            {p.label}
          </span>
        </div>
      ))}
    </div>
  )
}
