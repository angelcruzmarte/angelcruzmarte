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

// High-quality, natural-sounding named voices bundled by the major platforms
// (Apple, Google, Microsoft). Preferring these gives the clearest device audio.
const HIGH_QUALITY_NAMES = [
  "samantha",
  "ava",
  "siri",
  "allison",
  "susan",
  "zoe",
  "evan",
  "nathan",
  "tom",
  "aaron",
  "serena",
  "daniel",
  "karen",
  "moira",
  "tessa",
  "google",
  "natural",
  "neural",
]

/**
 * Scores a device (Web Speech API) voice by expected clarity/quality so we can
 * default to the best-sounding option. Higher is better. We reward voices the
 * OS labels as "enhanced"/"premium", known natural named voices, and network
 * (cloud) voices, which are typically far clearer than compact local ones.
 */
export function voiceQualityScore(voice: {
  name: string
  localService?: boolean
}): number {
  const n = (voice.name || "").toLowerCase()
  let score = 0
  if (/\b(enhanced|premium|neural|natural)\b/.test(n)) score += 5
  if (HIGH_QUALITY_NAMES.some((k) => n.includes(k))) score += 3
  // Network/cloud voices tend to sound clearer than compact on-device ones.
  if (voice.localService === false) score += 2
  if (n.includes("compact")) score -= 2
  return score
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
