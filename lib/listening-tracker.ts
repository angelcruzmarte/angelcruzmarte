"use client"

import { logListening } from "@/app/actions/stats"

/**
 * Accumulates listening time (seconds) and words on the client and flushes them
 * to the server in batches. Used by both the mini-player engine and the full
 * listen page so all playback counts toward the user's statistics.
 *
 * Time is measured with a wall-clock timer that only advances while playing.
 * Words are reported explicitly as the highlighted word advances.
 */

function todayKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

let pendingSeconds = 0
let pendingWords = 0
let playingSince: number | null = null
let flushTimer: ReturnType<typeof setInterval> | null = null

async function flush() {
  // Fold any in-progress play interval into the pending seconds.
  capture()
  const seconds = Math.round(pendingSeconds)
  const words = Math.round(pendingWords)
  if (seconds <= 0 && words <= 0) return
  pendingSeconds -= seconds
  pendingWords -= words
  try {
    await logListening({ day: todayKey(), seconds, words })
  } catch {
    // On failure, put the counts back so they retry on the next flush.
    pendingSeconds += seconds
    pendingWords += words
  }
}

/** Convert the currently-open play interval into accumulated seconds. */
function capture() {
  if (playingSince != null) {
    const now = Date.now()
    pendingSeconds += (now - playingSince) / 1000
    playingSince = now
  }
}

export function trackerStart() {
  if (playingSince == null) playingSince = Date.now()
  if (!flushTimer) {
    // Flush roughly every 15s while active.
    flushTimer = setInterval(() => {
      void flush()
    }, 15000)
  }
}

export function trackerPause() {
  capture()
  playingSince = null
  void flush()
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

/** Report that `n` new words have been narrated. */
export function trackerAddWords(n: number) {
  if (n > 0) pendingWords += n
}

export function trackerStop() {
  trackerPause()
}
