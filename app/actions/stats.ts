"use server"

import { db } from "@/lib/db"
import { listeningStat } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { and, eq, gte, sql } from "drizzle-orm"

export type StatRange = "week" | "month" | "6months" | "year"

export type StatPoint = { label: string; date: string; seconds: number; words: number }

export type StatsResult = {
  points: StatPoint[]
  totalSeconds: number
  totalWords: number
  dailyAvgSeconds: number
  dailyAvgWords: number
}

/** Local YYYY-MM-DD for a Date. */
function toDayString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Records listening activity for the current user on a given local day,
 * accumulating onto any existing row for that day.
 */
export async function recordListening(input: {
  seconds: number
  words: number
  day: string
}) {
  const seconds = Math.max(0, Math.round(input.seconds))
  const words = Math.max(0, Math.round(input.words))
  if (seconds === 0 && words === 0) return { ok: true as const }

  let userId: string
  try {
    userId = await getUserId()
  } catch {
    // Not signed in — silently ignore so playback never breaks.
    return { ok: false as const }
  }

  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.day)
    ? input.day
    : toDayString(new Date())

  await db
    .insert(listeningStat)
    .values({ userId, day, seconds, words })
    .onConflictDoUpdate({
      target: [listeningStat.userId, listeningStat.day],
      set: {
        seconds: sql`${listeningStat.seconds} + ${seconds}`,
        words: sql`${listeningStat.words} + ${words}`,
        updatedAt: new Date(),
      },
    })

  return { ok: true as const }
}

const RANGE_DAYS: Record<StatRange, number> = {
  week: 7,
  month: 30,
  "6months": 182,
  year: 365,
}

/**
 * Returns aggregated listening stats for a range, bucketed for charting:
 * - week/month: one bucket per day
 * - 6months/year: one bucket per week
 */
export async function getListeningStats(range: StatRange): Promise<StatsResult> {
  let userId: string
  try {
    userId = await getUserId()
  } catch {
    return emptyResult(range)
  }

  const days = RANGE_DAYS[range]
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const startDay = toDayString(start)

  const rows = await db
    .select({
      day: listeningStat.day,
      seconds: listeningStat.seconds,
      words: listeningStat.words,
    })
    .from(listeningStat)
    .where(
      and(eq(listeningStat.userId, userId), gte(listeningStat.day, startDay)),
    )

  const byDay = new Map<string, { seconds: number; words: number }>()
  for (const r of rows) {
    byDay.set(r.day, { seconds: r.seconds, words: r.words })
  }

  const bucketByWeek = range === "6months" || range === "year"
  const points: StatPoint[] = []
  let totalSeconds = 0
  let totalWords = 0

  if (!bucketByWeek) {
    for (let i = 0; i < days; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const key = toDayString(d)
      const val = byDay.get(key) ?? { seconds: 0, words: 0 }
      totalSeconds += val.seconds
      totalWords += val.words
      points.push({
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        date: key,
        seconds: val.seconds,
        words: val.words,
      })
    }
  } else {
    const weeks = Math.ceil(days / 7)
    for (let w = 0; w < weeks; w++) {
      const bucketStart = new Date(start)
      bucketStart.setDate(start.getDate() + w * 7)
      let seconds = 0
      let words = 0
      for (let i = 0; i < 7; i++) {
        const d = new Date(bucketStart)
        d.setDate(bucketStart.getDate() + i)
        const val = byDay.get(toDayString(d))
        if (val) {
          seconds += val.seconds
          words += val.words
        }
      }
      totalSeconds += seconds
      totalWords += words
      points.push({
        label: bucketStart.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        date: toDayString(bucketStart),
        seconds,
        words,
      })
    }
  }

  return {
    points,
    totalSeconds,
    totalWords,
    dailyAvgSeconds: Math.round(totalSeconds / days),
    dailyAvgWords: Math.round(totalWords / days),
  }
}

function emptyResult(range: StatRange): StatsResult {
  const days = RANGE_DAYS[range]
  return {
    points: [],
    totalSeconds: 0,
    totalWords: 0,
    dailyAvgSeconds: 0,
    dailyAvgWords: 0,
  }
}
