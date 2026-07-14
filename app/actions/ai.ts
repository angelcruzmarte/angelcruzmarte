"use server"

import { chunkText } from "@/lib/chunk-text"
import { languageName } from "@/lib/languages"
import { db } from "@/lib/db"
import { aiUsage } from "@/lib/db/schema"
import {
  FREE_DAILY_AI_GENERATIONS,
  getCurrentUser,
  hasActiveSubscription,
} from "@/lib/session"
import { generateObject, generateText } from "ai"
import { and, eq, sql } from "drizzle-orm"
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

// ----- Free-tier AI quota (summary / quiz / podcast) -----

function aiDayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

async function getAiUsedToday(userId: string): Promise<number> {
  const rows = await db
    .select({ count: aiUsage.count })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), eq(aiUsage.day, aiDayKey())))
    .limit(1)
  return rows[0]?.count ?? 0
}

/** Increment today's AI generation counter for a free user (best-effort). */
async function recordAiUsage(userId: string): Promise<void> {
  const day = aiDayKey()
  await db
    .insert(aiUsage)
    .values({ userId, day, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsage.userId, aiUsage.day],
      set: { count: sql`${aiUsage.count} + 1`, updatedAt: new Date() },
    })
}

type ContentToolGuard = {
  userId: string | null
  /** User-facing message when the tool is blocked; null when allowed. */
  message: string | null
  /** True for subscribers/admins (unlimited, never counted). */
  subscribed: boolean
}

/**
 * How many free AI generations the signed-in user has left today. Returns a
 * very large number for subscribers/admins (effectively unlimited) so callers
 * can treat it uniformly. Used by the free-tier quota banner.
 */
export async function getAiGenerationsLeftToday(): Promise<number> {
  const user = await getCurrentUser()
  if (!user) return 0
  if (hasActiveSubscription(user)) return Number.MAX_SAFE_INTEGER
  const used = await getAiUsedToday(user.id)
  return Math.max(0, FREE_DAILY_AI_GENERATIONS - used)
}

/**
 * Gate for the free-tier content tools (summary / quiz / podcast). Subscribers
 * and admins are unlimited. Free users get FREE_DAILY_AI_GENERATIONS per day;
 * beyond that they are prompted to subscribe. A credit is NOT consumed here —
 * call recordAiUsage() only after a successful generation so failures are free.
 */
async function contentToolGuard(): Promise<ContentToolGuard> {
  const user = await getCurrentUser()
  if (!user)
    return {
      userId: null,
      message: "Please sign in to use AI features.",
      subscribed: false,
    }
  if (hasActiveSubscription(user))
    return { userId: user.id, message: null, subscribed: true }
  const used = await getAiUsedToday(user.id)
  if (used >= FREE_DAILY_AI_GENERATIONS) {
    return {
      userId: user.id,
      message: `You've used all ${FREE_DAILY_AI_GENERATIONS} free AI generations for today. Subscribe for unlimited AI tools.`,
      subscribed: false,
    }
  }
  return { userId: user.id, message: null, subscribed: false }
}

export interface SummaryResult {
  summary: string
  keyPoints: string[]
  /** Present when the summary could not be produced (shown to the user). */
  error?: string
}

/**
 * Converts any AI/guard failure into a short, user-facing message. Thrown
 * errors from server actions are sanitized to a generic "Server Components
 * render" string in production, so tool actions must RETURN errors as data.
 */
function friendlyAiError(e: unknown, label: string): string {
  const msg = e instanceof Error ? e.message : String(e)
  console.error(`[v0] ${label} failed:`, msg)
  if (/sign in/i.test(msg)) return "Please sign in to use AI features."
  if (/subscription/i.test(msg))
    return "An active subscription is required to use AI features."
  if (/text first|provide some text/i.test(msg))
    return "We couldn't read any text from this document yet. Give it a moment after it opens, then try again."
  if (/rate|quota|429|overloaded|capacity/i.test(msg))
    return "The AI is busy right now. Please try again in a minute."
  return "Something went wrong generating this. Please try again."
}

export async function generateSummary(input: string): Promise<SummaryResult> {
  try {
    const guard = await contentToolGuard()
    if (guard.message)
      return { summary: "", keyPoints: [], error: guard.message }
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
    if (!guard.subscribed && guard.userId) await recordAiUsage(guard.userId)
    return object
  } catch (e) {
    return { summary: "", keyPoints: [], error: friendlyAiError(e, "generateSummary") }
  }
}

export interface QuizQuestion {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export interface QuizResult {
  questions: QuizQuestion[]
  error?: string
}

export async function generateQuiz(input: string): Promise<QuizResult> {
  try {
    const guard = await contentToolGuard()
    if (guard.message) return { questions: [], error: guard.message }
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
    if (!guard.subscribed && guard.userId) await recordAiUsage(guard.userId)
    return { questions: object.questions }
  } catch (e) {
    return { questions: [], error: friendlyAiError(e, "generateQuiz") }
  }
}

export interface PodcastSegment {
  speaker: string
  line: string
}

export interface PodcastResult {
  title: string
  segments: PodcastSegment[]
  error?: string
}

export async function generatePodcast(input: string): Promise<PodcastResult> {
  try {
    const guard = await contentToolGuard()
    if (guard.message) return { title: "", segments: [], error: guard.message }
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
    if (!guard.subscribed && guard.userId) await recordAiUsage(guard.userId)
    return object
  } catch (e) {
    return { title: "", segments: [], error: friendlyAiError(e, "generatePodcast") }
  }
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

/**
 * Answers a reader's question grounded in the document they are listening to.
 * Used by the in-reader "Chat" tool. Keeps answers concise and faithful to the
 * provided context, and says so when the answer isn't in the document.
 */
export interface ChatResult {
  answer: string
  error?: string
}

export async function askDocument(
  context: string,
  question: string,
): Promise<ChatResult> {
  try {
    const guard = await contentToolGuard()
    if (guard.message) return { answer: "", error: guard.message }
    const q = (question ?? "").trim()
    if (!q) return { answer: "", error: "Please enter a question." }
    const ctx = (context ?? "").trim().slice(0, MAX_INPUT)
    const { text } = await generateText({
      model: MODEL,
      prompt:
        "You are a helpful reading assistant. Answer the user's question using " +
        "the document below as your primary source. Be concise and clear. If the " +
        "answer isn't in the document, say so briefly and answer from general " +
        "knowledge if you can.\n\n" +
        `DOCUMENT:\n${ctx}\n\nQUESTION: ${q}`,
    })
    if (!guard.subscribed && guard.userId) await recordAiUsage(guard.userId)
    return { answer: text.trim() }
  } catch (e) {
    return { answer: "", error: friendlyAiError(e, "askDocument") }
  }
}

/** Quick free-form generation for the "Type anything" box on Home. */
export async function quickGenerate(prompt: string): Promise<string> {
  const guard = await contentToolGuard()
  if (guard.message) throw new Error(guard.message)
  const p = clamp(prompt)
  const { text } = await generateText({
    model: MODEL,
    prompt: p,
  })
  if (!guard.subscribed && guard.userId) await recordAiUsage(guard.userId)
  return text
}
