// Lightweight haptic feedback helper. Uses the Vibration API where supported
// (Android Chrome/Firefox, some others). iOS Safari/WKWebView ignore it, which
// is fine — this is a progressive enhancement, never required for a flow to work.
// Respects the user's reduced-motion preference: if they've asked for less
// motion, we don't buzz them either.

type HapticPattern = "light" | "medium" | "success" | "warning" | "error"

const PATTERNS: Record<HapticPattern, number | number[]> = {
  light: 10,
  medium: 20,
  success: [12, 40, 12],
  warning: [20, 60, 20],
  error: [40, 60, 40],
}

export function haptic(pattern: HapticPattern = "light"): void {
  if (typeof window === "undefined" || typeof navigator === "undefined") return
  if (typeof navigator.vibrate !== "function") return
  try {
    const prefersReduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches
    if (prefersReduced) return
    navigator.vibrate(PATTERNS[pattern])
  } catch {
    // Vibration can throw if called from a disallowed context; ignore.
  }
}
