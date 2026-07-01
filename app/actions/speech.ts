"use server"

import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { experimental_generateSpeech as generateSpeech } from "ai"

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

const VALID_VOICES = new Set<string>(PREMIUM_VOICES.map((v) => v.id))
// OpenAI TTS accepts up to ~4096 characters per request; stay safely under it.
const MAX_CHARS = 3500

type SpeechResponse =
  | { audio: string; mediaType: string }
  | { error: string }

export async function generatePremiumSpeech(
  text: string,
  voice: string,
): Promise<SpeechResponse> {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to use premium narration." }
  if (!hasActiveSubscription(user)) {
    return { error: "Premium narration requires an active subscription." }
  }

  const trimmed = (text ?? "").trim()
  if (!trimmed) return { error: "There is no text to narrate." }
  if (trimmed.length > MAX_CHARS) {
    return { error: "This passage is too long for a single request." }
  }

  const selectedVoice: PremiumVoiceId = VALID_VOICES.has(voice)
    ? (voice as PremiumVoiceId)
    : "alloy"

  try {
    const result = await generateSpeech({
      model: "openai/tts-1",
      text: trimmed,
      voice: selectedVoice,
      outputFormat: "mp3",
    })
    return {
      audio: result.audio.base64,
      mediaType: result.audio.mediaType ?? "audio/mpeg",
    }
  } catch (err) {
    console.log("[v0] premium speech error:", err instanceof Error ? err.message : err)
    return { error: "Could not generate audio right now. Please try again." }
  }
}
