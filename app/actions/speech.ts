"use server"

import { createHash } from "node:crypto"
import { head, put } from "@vercel/blob"
import { chunkText } from "@/lib/chunk-text"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { experimental_generateSpeech as generateSpeech } from "ai"
import {
  LEGACY_VOICE_IDS,
  PREMIUM_VOICES,
  getPremiumVoice,
  voiceEngine,
  type PremiumVoice,
} from "@/lib/voices"

const VALID_VOICES = new Set<string>(PREMIUM_VOICES.map((v) => v.id))
// OpenAI TTS accepts up to ~4096 characters per request; stay safely under it.
const MAX_CHARS = 3500
// Cap total download length so a single request stays within reason.
const MAX_DOWNLOAD_CHARS = 60000

// "gpt-4o-mini-tts" is the newest model and supports ALL 13 voices, so it is
// the primary. The legacy "tts-1-hd"/"tts-1" models only support a 9-voice
// subset but have more rate-limit headroom, so we use them as fallbacks — but
// only for voices they actually support (see modelsForVoice).
const MINI_MODEL = "openai/gpt-4o-mini-tts"
const LEGACY_MODELS = ["openai/tts-1-hd", "openai/tts-1"] as const

/**
 * Ordered model fallback chain valid for the given persona. Personas with style
 * instructions must use the mini model exclusively (legacy models ignore
 * instructions). Instruction-free legacy engines may fall back for rate-limit
 * headroom.
 */
function modelsForVoice(persona: PremiumVoice): string[] {
  if (persona.instructions) return [MINI_MODEL]
  return LEGACY_VOICE_IDS.has(voiceEngine(persona))
    ? [MINI_MODEL, ...LEGACY_MODELS]
    : [MINI_MODEL]
}

function isRateLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /rate.?limit|429|GatewayRateLimit|quota|overloaded|capacity/i.test(msg)
}

async function synthOnce(model: string, text: string, persona: PremiumVoice) {
  return generateSpeech({
    model,
    text,
    voice: voiceEngine(persona),
    outputFormat: "mp3",
    maxRetries: 0,
    ...(persona.instructions
      ? { instructions: persona.instructions }
      : {}),
  })
}

/**
 * Synthesize speech, preferring the HD model but falling back to the standard
 * model the moment HD is rate-limited. Within each model we retry a couple of
 * times with short exponential backoff to ride out transient throttling. This
 * guarantees audio is produced quickly rather than surfacing a "high demand"
 * error. We disable the SDK's own retries so our timing fully controls it.
 */
async function synthWithRetry(
  text: string,
  persona: PremiumVoice,
): Promise<Awaited<ReturnType<typeof generateSpeech>>> {
  let lastErr: unknown
  const models = modelsForVoice(persona)
  for (let m = 0; m < models.length; m++) {
    const model = models[m]
    const isLastModel = m === models.length - 1
    // Give the fallback (standard) model more retries since it's our safety net.
    const tries = isLastModel ? 4 : 2
    for (let attempt = 0; attempt < tries; attempt++) {
      try {
        return await synthOnce(model, text, persona)
      } catch (err) {
        lastErr = err
        // Non-rate-limit errors are real failures; surface them immediately.
        if (!isRateLimit(err)) throw err
        const isLastAttempt = attempt === tries - 1
        // On the last attempt for a non-final model, break to fall back fast.
        if (isLastAttempt) break
        const delay = 700 * 2 ** attempt
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw lastErr
}

// --- Persistent audio cache (Vercel Blob) -----------------------------------
//
// Each unique (voice + exact text) is synthesized only ONCE, then stored in
// Blob and served by its public URL forever after. This is the key to
// reliability: once a section has been generated, replays and other users never
// call the rate-limited TTS API again, so the "high demand" error disappears
// for anything that has been played before.

function cacheKey(text: string, voice: string): string {
  const hash = createHash("sha256").update(`${voice}\u0000${text}`).digest("hex")
  return `voxyfi-audio/${voice}/${hash}.mp3`
}

/** Returns the public URL of a cached clip, or null if it isn't cached yet. */
async function getCachedUrl(pathname: string): Promise<string | null> {
  try {
    const meta = await head(pathname)
    return meta?.url ?? null
  } catch {
    // head() throws BlobNotFoundError when the object doesn't exist.
    return null
  }
}

// Dedupe concurrent generation of the same clip within a server instance so two
// simultaneous requests don't both hit the TTS API for the same section.
const inflightUrl = new Map<string, Promise<string>>()

/**
 * Returns a public URL for the spoken audio of `text` in `voice`, generating
 * and caching it on first use. Cache hits never touch the TTS API.
 */
async function getOrCreateAudioUrl(
  text: string,
  persona: PremiumVoice,
): Promise<string> {
  // Key by persona id so two personas sharing an engine but differing in style
  // instructions never collide in the cache.
  const pathname = cacheKey(text, persona.id)
  const cached = await getCachedUrl(pathname)
  if (cached) return cached

  const running = inflightUrl.get(pathname)
  if (running) return running

  const task = (async () => {
    const result = await synthWithRetry(text, persona)
    const bytes = Buffer.from(result.audio.base64, "base64")
    const blob = await put(pathname, bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "audio/mpeg",
      // Audio for a given text never changes — let browsers/CDN cache it hard.
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    })
    return blob.url
  })()

  inflightUrl.set(pathname, task)
  try {
    return await task
  } finally {
    inflightUrl.delete(pathname)
  }
}

/**
 * Returns the raw MP3 bytes for `text` in `voice`, using the Blob cache. Used by
 * the download path so repeat downloads and already-played sections are instant.
 */
async function getOrCreateAudioBytes(
  text: string,
  persona: PremiumVoice,
): Promise<Uint8Array> {
  const pathname = cacheKey(text, persona.id)
  const cached = await getCachedUrl(pathname)
  if (cached) {
    try {
      const res = await fetch(cached)
      if (res.ok) return new Uint8Array(await res.arrayBuffer())
    } catch {
      // Fall through to regeneration if the cached object can't be fetched.
    }
  }
  const result = await synthWithRetry(text, persona)
  const buffer = Buffer.from(result.audio.base64, "base64")
  await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "audio/mpeg",
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  })
  return new Uint8Array(buffer)
}

type SpeechResponse = { url: string } | { error: string }

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

  const persona =
    (VALID_VOICES.has(voice) ? getPremiumVoice(voice) : undefined) ??
    getPremiumVoice("alloy")!

  try {
    const url = await getOrCreateAudioUrl(trimmed, persona)
    return { url }
  } catch (err) {
    console.log("[v0] premium speech error:", err instanceof Error ? err.message : err)
    if (isRateLimit(err)) {
      return {
        error:
          "Audio is in high demand right now. Please wait a moment and press play again.",
      }
    }
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

  const persona =
    (VALID_VOICES.has(voice) ? getPremiumVoice(voice) : undefined) ??
    getPremiumVoice("alloy")!

  const chunks = chunkText(
    trimmed.slice(0, MAX_DOWNLOAD_CHARS),
    MAX_CHARS,
  )
  if (chunks.length === 0) return { error: "There is no text to narrate." }

  try {
    const buffers: Uint8Array[] = []
    for (const chunk of chunks) {
      buffers.push(await getOrCreateAudioBytes(chunk, persona))
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

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}
