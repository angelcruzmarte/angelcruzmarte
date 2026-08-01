// Estimated reading & listening time from a book's text. Pure/no-AI so it's
// free and instant. Words are counted by whitespace runs. Rates are typical
// averages: ~238 wpm silent reading, ~150 wpm narrated audio.
const WORDS_PER_MINUTE_READ = 238
const WORDS_PER_MINUTE_LISTEN = 150

export function countWords(text: string | null | undefined): number {
  if (!text) return 0
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export interface ReadingStats {
  words: number
  readMinutes: number
  listenMinutes: number
}

/** Reading/listening estimates for a body of text. `words === 0` means unknown. */
export function estimateReadingStats(
  text: string | null | undefined,
): ReadingStats {
  const words = countWords(text)
  return {
    words,
    readMinutes: words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE_READ)) : 0,
    listenMinutes:
      words > 0 ? Math.max(1, Math.round(words / WORDS_PER_MINUTE_LISTEN)) : 0,
  }
}

/** Formats a minute count as a short human label, e.g. "12 min" or "1 hr 5 min". */
export function formatMinutes(mins: number): string {
  if (mins <= 0) return ""
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}
