"use server"

import { db } from "@/lib/db"
import { listeningStat } from "@/lib/db/schema"
import { getUserId } from "@/lib/session"
import { and, eq, gte, sql } from "drizzle-orm"
import {
  RANGE_DAYS,
  type LifetimeStats,
  type StatPoint,
  type StatRange,
  type StatsSummary,
} from "@/lib/stats-shared"

/**
 * Records listening activity for the signed-in user on a specific local day.
 * Upserts into the per-user/day aggregate so repeated calls accumulate.
 * `day` is the client's local calendar day (YYYY-MM-DD) so buckets line up
 * with what the user sees regardless of server timezone.
 */
export async function logListening(input: {
  day: string
  seconds: number
  words: number
}): Promise<void> {
  const userId = await getUserId()

  const seconds = Math.max(0, Math.round(input.seconds || 0))
  const words = Math.max(0, Math.round(input.words || 0))
  if (seconds === 0 && words === 0) return

  // Basic validation of the YYYY-MM-DD day key.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(input.day)
    ? input.day
    : new Date().toISOString().slice(0, 10)

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
}

/** All-time totals + current streak for the signed-in user. */
export async function getLifetimeStats(): Promise<LifetimeStats> {
  const userId = await getUserId()

  const rows = await db
    .select({
      day: listeningStat.day,
      seconds: listeningStat.seconds,
      words: listeningStat.words,
    })
    .from(listeningStat)
    .where(eq(listeningStat.userId, userId))

  let totalSeconds = 0
  let totalWords = 0
  const activeSet = new Set<string>()
  for (const r of rows) {
    totalSeconds += r.seconds
    totalWords += r.words
    if (r.seconds > 0 || r.words > 0) activeSet.add(r.day)
  }

  // Walk backwards from today counting consecutive active days.
  let currentStreak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  // Allow the streak to still count if today has no activity yet.
  if (!activeSet.has(toDayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (activeSet.has(toDayKey(cursor))) {
    currentStreak++
    cursor.setDate(cursor.getDate() - 1)
  }

  return {
    totalSeconds,
    totalWords,
    activeDays: activeSet.size,
    currentStreak,
  }
}

/** Returns a YYYY-MM-DD key for a Date in its local time. */
function toDayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Aggregated listening data for the given range, filled with zero-days so the
 * chart always has a continuous series ending today.
 */
export async function getListeningStats(
  range: StatRange,
): Promise<StatsSummary> {
  const userId = await getUserId()
  const days = RANGE_DAYS[range]

  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  const startKey = toDayKey(start)

  const rows = await db
    .select({
      day: listeningStat.day,
      seconds: listeningStat.seconds,
      words: listeningStat.words,
    })
    .from(listeningStat)
    .where(
      and(eq(listeningStat.userId, userId), gte(listeningStat.day, startKey)),
    )

  const byDay = new Map<string, { seconds: number; words: number }>()
  for (const r of rows) {
    byDay.set(r.day, { seconds: r.seconds, words: r.words })
  }

  const points: StatPoint[] = []
  let totalSeconds = 0
  let totalWords = 0
  for (let i = 0; i < days; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const key = toDayKey(d)
    const found = byDay.get(key)
    const seconds = found?.seconds ?? 0
    const words = found?.words ?? 0
    totalSeconds += seconds
    totalWords += words
    points.push({ day: key, seconds, words })
  }

  return {
    points,
    totalSeconds,
    totalWords,
    avgSeconds: Math.round(totalSeconds / days),
    avgWords: Math.round(totalWords / days),
    days,
  }
}
