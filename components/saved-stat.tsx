"use client"

import { useEffect, useState } from "react"
import { Smile } from "lucide-react"

export function SavedStat({
  minutesSaved,
  docCount,
}: {
  minutesSaved: number
  docCount: number
}) {
  // Average listening speed is stored by the player when the user changes it.
  const [avgSpeed, setAvgSpeed] = useState<number>(docCount > 0 ? 1 : 0)

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem("voxyfi:avgSpeed"))
      if (saved && saved > 0) setAvgSpeed(saved)
    } catch {}
  }, [])

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-secondary px-4 py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
        <Smile className="h-5 w-5" />
      </span>
      <p className="text-sm">
        <span className="font-semibold">{minutesSaved}m saved</span>{" "}
        <span className="text-muted-foreground">
          with {avgSpeed % 1 === 0 ? avgSpeed : avgSpeed.toFixed(2)}x avg speed
        </span>
      </p>
    </div>
  )
}
