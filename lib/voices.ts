/** Premium voices offered to subscribers, mapped to OpenAI TTS voice IDs. */
export const PREMIUM_VOICES = [
  { id: "alloy", label: "Alloy — Balanced" },
  { id: "nova", label: "Nova — Warm" },
  { id: "shimmer", label: "Shimmer — Bright" },
  { id: "echo", label: "Echo — Calm" },
  { id: "onyx", label: "Onyx — Deep" },
  { id: "fable", label: "Fable — Expressive" },
] as const

export type PremiumVoiceId = (typeof PREMIUM_VOICES)[number]["id"]

// ---------------------------------------------------------------------------
// Device (Web Speech API) voice helpers: present a friendly, human-first list
// by filtering out robotic/novelty voices, cleaning up names, and grouping by
// language.
// ---------------------------------------------------------------------------

// Classic robotic / novelty TTS voices (macOS/iOS/Windows) that do not sound
// human. These are excluded so users only see natural-sounding options.
const NOVELTY_VOICES = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "jester",
  "organ",
  "pipe organ",
  "superstar",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
  "fred",
  "junior",
  "ralph",
  "kathy",
  "agnes",
  "princess",
  "bruce",
  "grandpa",
  "grandma",
])

/** Returns true when a voice name is a natural, human-like voice. */
export function isHumanLikeVoice(name: string): boolean {
  const n = (name || "").trim().toLowerCase()
  if (!n) return false
  if (NOVELTY_VOICES.has(n)) return false
  if (n.includes("eloquence") || n.includes("novelty")) return false
  return true
}

/** Base language code, e.g. "en-US" -> "en". */
export function baseLang(lang: string): string {
  return (lang || "").split("-")[0].toLowerCase()
}

/** Human-readable language label, e.g. "en" -> "English". */
export function languageLabel(lang: string): string {
  if (!lang) return "Unknown"
  try {
    const dn = new Intl.DisplayNames(undefined, { type: "language" })
    return dn.of(lang) || lang
  } catch {
    return lang
  }
}

/**
 * Derives a clean, readable voice name. Some platforms expose bundle-id style
 * names (e.g. "com.apple.ttsbundle.Samantha-compact"); this strips the noise
 * and falls back to the language label when nothing readable remains.
 */
export function friendlyVoiceName(name: string, lang: string): string {
  let n = (name || "").trim()

  // Strip bundle-id style identifiers like "com.apple.ttsbundle.Samantha-compact".
  if (n.includes(".") || n.toLowerCase().startsWith("com")) {
    const parts = n.split(".")
    n = parts[parts.length - 1] || ""
  }

  n = n
    .replace(/[-_]+/g, " ")
    .replace(/\b(compact|premium|enhanced|default|siri|voice)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()

  // Title-case whatever is left.
  n = n
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim()

  return n || languageLabel(lang)
}
