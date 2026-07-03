"use server"

import { chunkText } from "@/lib/chunk-text"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { experimental_generateSpeech as generateSpeech } from "ai"
import { PREMIUM_VOICES, type PremiumVoiceId } from "@/lib/voices"

const VALID_VOICES = new Set<string>(PREMIUM_VOICES.map((v) => v.id))
// OpenAI TTS accepts up to ~4096 characters per request; stay safely under it.
const MAX_CHARS = 3500
// Cap total download length so a single request stays within reason.
const MAX_DOWNLOAD_CHARS = 60000

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

type DownloadResponse =
  | { audio: string; mediaType: string }
  | { error: string }

/**
 * Generates a single downloadable MP3 for an entire document/book by
 * synthesizing each chunk and concatenating the audio. MP3 frames can be
 * concatenated directly, so joining the byte buffers yields a valid file.
 * Premium (subscriber) only.
 */
export async function generateDownloadableAudio(
  text: string,
  voice: string,
): Promise<DownloadResponse> {
  const user = await getCurrentUser()
  if (!user) return { error: "You must be signed in to download audio." }
  if (!hasActiveSubscription(user)) {
    return { error: "Downloading audio requires an active subscription." }
  }

  const trimmed = (text ?? "").trim()
  if (!trimmed) return { error: "There is no text to narrate." }

  const selectedVoice: PremiumVoiceId = VALID_VOICES.has(voice)
    ? (voice as PremiumVoiceId)
    : "alloy"

  const chunks = chunkText(
    trimmed.slice(0, MAX_DOWNLOAD_CHARS),
    MAX_CHARS,
  )
  if (chunks.length === 0) return { error: "There is no text to narrate." }

  try {
    const buffers: Uint8Array[] = []
    for (const chunk of chunks) {
      const result = await generateSpeech({
        model: "openai/tts-1",
        text: chunk,
        voice: selectedVoice,
        outputFormat: "mp3",
      })
      buffers.push(base64ToBytes(result.audio.base64))
    }

    const total = buffers.reduce((sum, b) => sum + b.length, 0)
    const merged = new Uint8Array(total)
    let offset = 0
    for (const b of buffers) {
      merged.set(b, offset)
      offset += b.length
    }

    return {
      audio: bytesToBase64(merged),
      mediaType: "audio/mpeg",
    }
  } catch (err) {
    console.log(
      "[v0] downloadable audio error:",
      err instanceof Error ? err.message : err,
    )
    return { error: "Could not generate the download right now. Try again." }
  }
}

function base64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"))
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}
