// Shared, non-server constants and types for listening statistics. Kept out of
// the "use server" actions file, which may only export async functions.

export const DAILY_GOAL_MINUTES = 30

export type StatRange = "week" | "month" | "6months" | "year"

export type StatPoint = {
  /** Local day key, YYYY-MM-DD. */
  day: string
  seconds: number
  words: number
}

export type StatsSummary = {
  points: StatPoint[]
  totalSeconds: number
  totalWords: number
  avgSeconds: number
  avgWords: number
  days: number
}

export type LifetimeStats = {
  totalSeconds: number
  totalWords: number
  activeDays: number
  /** Consecutive days ending today (or yesterday) with any listening. */
  currentStreak: number
}

export const RANGE_DAYS: Record<StatRange, number> = {
  week: 7,
  month: 30,
  "6months": 182,
  year: 365,
}

/** Number of days each range spans. */
export function rangeDays(range: StatRange): number {
  return RANGE_DAYS[range]
}
