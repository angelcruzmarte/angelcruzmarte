"use server"

import { chunkText } from "@/lib/chunk-text"
import { languageName } from "@/lib/languages"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { generateObject, generateText } from "ai"
import { z } from "zod"

const MODEL = "openai/gpt-5.4-mini"
// Anthropic is a separate zero-config provider with its own free-tier quota;
// OpenAI text models are aggressively rate-limited on the free tier, so we use
// Claude for the higher-volume translation workload.
const TRANSLATE_MODEL = "anthropic/claude-haiku-4.5"
const MAX_INPUT = 16000
// Upper bound on how much text we translate to keep latency/cost reasonable.
const MAX_TRANSLATE = 24000
// Per-request translation chunk size (chars). Larger chunks = fewer requests,
// which is friendlier to rate limits.
const TRANSLATE_CHUNK = 4000

async function requirePremium() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Please sign in to use AI features.")
  if (!hasActiveSubscription(user)) {
    throw new Error("An active subscription is required to use AI features.")
  }
}

/**
 * Non-throwing premium check. Returns a user-facing message string when the
 * user is not eligible, or null when allowed. Used by actions that surface
 * errors as returned data (thrown errors are sanitized in production).
 */
async function premiumGuardMessage(): Promise<string | null> {
  const user = await getCurrentUser()
  if (!user) return "Please sign in to use AI features."
  if (!hasActiveSubscription(user)) {
    return "An active subscription is required to use AI features."
  }
  return null
}

function clamp(text: string) {
  const t = text.trim()
  if (!t) throw new Error("Please provide some text first.")
  return t.slice(0, MAX_INPUT)
}

export interface SummaryResult {
  summary: string
  keyPoints: string[]
}

export async function generateSummary(input: string): Promise<SummaryResult> {
  await requirePremium()
  const text = clamp(input)
  const { object } = await generateObject({
    model: MODEL,
    schema: z.object({
      summary: z
        .string()
        .describe("A concise 2-3 sentence summary of the text."),
      keyPoints: z
        .array(z.string())
        .describe("3 to 6 short bullet-point takeaways."),
    }),
    prompt: `Summarize the following text. Provide a short summary and the key takeaways.\n\n${text}`,
  })
  return object
}

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export async function generateQuiz(input: string): Promise<QuizQuestion[]> {
  await requirePremium()
  const text = clamp(input)
  const { object } = await generateObject({
    model: MODEL,
    schema: z.object({
      questions: z
        .array(
          z.object({
            question: z.string(),
            options: z
              .array(z.string())
              .describe("Exactly 4 answer choices."),
            correctIndex: z
              .number()
              .int()
              .describe("0-based index of the correct option."),
            explanation: z
              .string()
              .describe("A one-sentence explanation of the answer."),
          }),
        )
        .describe("4 to 6 multiple-choice questions."),
    }),
    prompt: `Create a multiple-choice quiz that tests comprehension of the following text. Each question must have exactly 4 options with one correct answer.\n\n${text}`,
  })
  return object.questions
}

export interface PodcastSegment {
  speaker: string
  line: string
}

export interface PodcastResult {
  title: string
  segments: PodcastSegment[]
}

export async function generatePodcast(input: string): Promise<PodcastResult> {
  await requirePremium()
  const text = clamp(input)
  const { object } = await generateObject({
    model: MODEL,
    schema: z.object({
      title: z.string().describe("A catchy episode title."),
      segments: z
        .array(
          z.object({
            speaker: z
              .string()
              .describe('Either "Host" or "Guest".'),
            line: z.string().describe("What this speaker says."),
          }),
        )
        .describe(
          "A natural back-and-forth conversation of 8 to 14 segments between Host and Guest discussing the text.",
        ),
    }),
    prompt: `Turn the following text into an engaging two-person podcast conversation between a Host and a Guest. Keep it lively, insightful, and faithful to the source.\n\n${text}`,
  })
  return object
}

export interface TranslationResult {
  translated: string
  truncated: boolean
  /** Present when translation could not be completed (shown to the user). */
  error?: string
}

/**
 * Removes accent marks / diacritics from translated text (á→a, é→e, ü→u, etc.)
 * while preserving the Spanish letter "ñ", which is a distinct letter rather
 * than an accent (dropping its tilde would change words like "año" → "ano").
 */
function stripAccents(text: string): string {
  return text
    .replace(/ñ/g, "\u0001")
    .replace(/Ñ/g, "\u0002")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0001/g, "ñ")
    .replace(/\u0002/g, "Ñ")
}

async function translateChunkOnce(chunk: string, language: string) {
  const { text } = await generateText({
    model: TRANSLATE_MODEL,
    prompt:
      `Translate the following text into ${language}. ` +
      `Preserve the meaning, tone, and paragraph breaks. ` +
      `Do not add notes, explanations, or quotation marks — output only the translation.\n\n` +
      chunk,
  })
  return stripAccents(text.trim())
}

/** Translate one chunk with a single retry to ride out transient rate limits. */
async function translateChunk(chunk: string, language: string) {
  try {
    return await translateChunkOnce(chunk, language)
  } catch {
    await new Promise((r) => setTimeout(r, 800))
    return translateChunkOnce(chunk, language)
  }
}

/**
 * Runs async tasks with bounded concurrency so we never fire dozens of model
 * requests at once (which trips provider rate limits). Results preserve order.
 */
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * Translates document text into the target language for reading/narration.
 * The text is split into chunks (up to MAX_TRANSLATE characters) translated
 * with bounded concurrency + retry. If an individual chunk still fails, the
 * original text is kept for that chunk so the whole request never hard-fails.
 */
export async function translateText(
  input: string,
  targetLang: string,
): Promise<TranslationResult> {
  const premiumError = await premiumGuardMessage()
  if (premiumError) return { translated: input ?? "", truncated: false, error: premiumError }

  const source = (input ?? "").trim()
  if (!source) return { translated: "", truncated: false }

  const language = languageName(targetLang)
  const truncated = source.length > MAX_TRANSLATE
  const capped = source.slice(0, MAX_TRANSLATE)
  const chunks = chunkText(capped, TRANSLATE_CHUNK)

  let failures = 0
  const out = await mapPool(chunks, 2, async (chunk) => {
    try {
      return await translateChunk(chunk, language)
    } catch {
      // Keep the original text for this chunk rather than failing the document.
      failures++
      return chunk
    }
  })

  // If nothing could be translated, return a clear message as data (thrown
  // errors are sanitized in production, so we must not throw here).
  if (failures === chunks.length) {
    return {
      translated: source,
      truncated,
      error:
        "Translation is temporarily unavailable due to high demand. Please try again in a minute.",
    }
  }

  return { translated: out.join("\n\n"), truncated }
}

/**
 * Translates a single passage (e.g. one narration section) into the target
 * language. Used for fast, progressive, per-section translation.
 */
export async function translatePassage(
  input: string,
  targetLang: string,
): Promise<string> {
  await requirePremium()
  const source = (input ?? "").trim()
  if (!source) return ""
  return translateChunk(source, languageName(targetLang))
}

/**
 * Detects the primary language of a text sample and returns a two-letter
 * (ISO 639-1) code, e.g. "en", "fr", "zh". Best-effort: returns null when it
 * can't determine a language (empty input, model error/rate limit). Not
 * premium-gated because it runs during upload for every document.
 */
export async function detectLanguage(input: string): Promise<string | null> {
  const sample = (input ?? "").trim().slice(0, 2000)
  if (sample.length < 12) return null
  try {
    const { object } = await generateObject({
      model: TRANSLATE_MODEL,
      schema: z.object({
        code: z
          .string()
          .describe(
            "The ISO 639-1 two-letter language code of the text (lowercase), e.g. en, es, fr, de, zh, ja, ar.",
          ),
      }),
      prompt:
        "Identify the primary natural language of the following text. " +
        "Respond with only its ISO 639-1 two-letter code.\n\n" +
        sample,
    })
    const code = object.code?.trim().toLowerCase().slice(0, 2)
    return code && /^[a-z]{2}$/.test(code) ? code : null
  } catch {
    return null
  }
}

/**
 * Extracts readable text from an image scan (photo of a page, screenshot, etc.)
 * using the multimodal model. Returns the transcribed text, or throws when the
 * image can't be read.
 */
export async function extractTextFromImage(
  dataUrl: string,
): Promise<string> {
  const { text } = await generateText({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe all readable text from this image exactly as it " +
              "appears, preserving paragraph breaks and reading order. " +
              "Return only the transcribed text with no commentary.",
          },
          { type: "image", image: dataUrl },
        ],
      },
    ],
  })
  return text.trim()
}

/** Quick free-form generation for the "Type anything" box on Home. */
export async function quickGenerate(prompt: string): Promise<string> {
  await requirePremium()
  const p = clamp(prompt)
  const { text } = await generateText({
    model: MODEL,
    prompt: p,
  })
  return text
}
