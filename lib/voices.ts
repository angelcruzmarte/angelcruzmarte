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
