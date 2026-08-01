"use server"

import { chunkText } from "@/lib/chunk-text"
import { languageName } from "@/lib/languages"
import { db } from "@/lib/db"
import { aiQuota, book, document, documentTranslation } from "@/lib/db/schema"
import { sectionHash } from "@/lib/hash"
import {
  FREE_AI_QUOTA_CAPACITY,
  FREE_AI_REFILL_AMOUNT,
  FREE_AI_REFILL_PERIOD_MS,
} from "@/lib/limits"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { generateObject, generateText } from "ai"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

const MODEL = "openai/gpt-5.4-mini"
// Translation is the highest-volume workload, so we run it on a DIFFERENT
// provider than MODEL (OpenAI). Google's Gemini Flash is fast, zero-config, and
// accessible on the free tier, and using a separate provider means translation
// draws from its own rate-limit bucket instead of competing with summaries/
// quizzes/chat. If it fails, translateChunkOnce falls back to MODEL.
// (Note: anthropic/* is NOT available to free-tier gateway users.)
const TRANSLATE_MODEL = "google/gemini-2.5-flash"
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

// ----- Free-tier AI quota (refilling token bucket) -----
//
// A free user banks up to FREE_AI_QUOTA_CAPACITY AI generations. A quarter of
// that capacity (FREE_AI_REFILL_AMOUNT) refills every FREE_AI_REFILL_PERIOD_MS,
// rather than everyone resetting on a calendar-day boundary. State is a token
// count plus an "anchor" timestamp (updatedAt) from which whole refill periods
// are measured; leftover partial time carries forward.

/**
 * Pure token-bucket refill. Given the stored token count and anchor time,
 * returns the tokens available now and the new anchor. When the bucket is full
 * the anchor resets to now so the countdown to the next refill starts fresh.
 */
function refillTokens(
  tokens: number,
  anchorMs: number,
  nowMs: number,
): { tokens: number; anchorMs: number } {
  if (tokens >= FREE_AI_QUOTA_CAPACITY) {
    return { tokens: FREE_AI_QUOTA_CAPACITY, anchorMs: nowMs }
  }
  const elapsed = nowMs - anchorMs
  const periods = Math.floor(elapsed / FREE_AI_REFILL_PERIOD_MS)
  if (periods <= 0) return { tokens, anchorMs }
  const next = Math.min(
    FREE_AI_QUOTA_CAPACITY,
    tokens + periods * FREE_AI_REFILL_AMOUNT,
  )
  // If we hit capacity, reset the anchor to now; otherwise advance it by the
  // whole periods consumed so remaining partial time is preserved.
  const nextAnchor =
    next >= FREE_AI_QUOTA_CAPACITY
      ? nowMs
      : anchorMs + periods * FREE_AI_REFILL_PERIOD_MS
  return { tokens: next, anchorMs: nextAnchor }
}

/** Current bucket state for a user (after refill), without persisting. */
async function readQuota(
  userId: string,
  nowMs: number,
): Promise<{ tokens: number; anchorMs: number; existed: boolean }> {
  const rows = await db
    .select({ tokens: aiQuota.tokens, updatedAt: aiQuota.updatedAt })
    .from(aiQuota)
    .where(eq(aiQuota.userId, userId))
    .limit(1)
  // No row yet means the user has never spent a token: start full.
  if (!rows[0]) {
    return { tokens: FREE_AI_QUOTA_CAPACITY, anchorMs: nowMs, existed: false }
  }
  const refilled = refillTokens(rows[0].tokens, rows[0].updatedAt.getTime(), nowMs)
  return { ...refilled, existed: true }
}

export interface AiQuotaStatus {
  /** Whole AI generations available right now. */
  available: number
  /** Maximum that can be banked. */
  capacity: number
  /** True for subscribers/admins (no limit applies). */
  unlimited: boolean
  /** Minutes until the next generation refills, or null when full/unlimited. */
  nextRefillMinutes: number | null
}

/**
 * Free-tier quota status for the signed-in user. Subscribers/admins are
 * reported as unlimited. Used by the quota banner and Home pill.
 */
export async function getAiQuotaStatus(): Promise<AiQuotaStatus> {
  const user = await getCurrentUser()
  const capacity = FREE_AI_QUOTA_CAPACITY
  if (!user)
    return { available: 0, capacity, unlimited: false, nextRefillMinutes: null }
  if (hasActiveSubscription(user))
    return { available: capacity, capacity, unlimited: true, nextRefillMinutes: null }

  const now = Date.now()
  const { tokens, anchorMs } = await readQuota(user.id, now)
  const available = Math.floor(tokens)
  let nextRefillMinutes: number | null = null
  if (available < capacity) {
    const remaining = FREE_AI_REFILL_PERIOD_MS - ((now - anchorMs) % FREE_AI_REFILL_PERIOD_MS)
    nextRefillMinutes = Math.max(1, Math.ceil(remaining / 60000))
  }
  return { available, capacity, unlimited: false, nextRefillMinutes }
}

/** Spend one token for a free user (best-effort), persisting the new state. */
async function consumeAiToken(userId: string): Promise<void> {
  const now = Date.now()
  const { tokens, anchorMs, existed } = await readQuota(userId, now)
  const remaining = Math.max(0, tokens - 1)
  if (!existed) {
    await db
      .insert(aiQuota)
      .values({ userId, tokens: remaining, updatedAt: new Date(anchorMs) })
      .onConflictDoUpdate({
        target: aiQuota.userId,
        set: { tokens: remaining, updatedAt: new Date(anchorMs) },
      })
    return
  }
  await db
    .update(aiQuota)
    .set({ tokens: remaining, updatedAt: new Date(anchorMs) })
    .where(eq(aiQuota.userId, userId))
}

type ContentToolGuard = {
  userId: string | null
  /** User-facing message when the tool is blocked; null when allowed. */
  message: string | null
  /** True for subscribers/admins (unlimited, never counted). */
  subscribed: boolean
}

/**
 * Gate for the free-tier AI tools. Subscribers and admins are unlimited. Free
 * users draw from the refilling token bucket; when empty they are told when the
 * next generation refills and prompted to subscribe. A token is NOT consumed
 * here — call consumeAiToken() only after a successful generation so failed
 * attempts are free.
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

  const now = Date.now()
  const { tokens, anchorMs } = await readQuota(user.id, now)
  if (Math.floor(tokens) < 1) {
    const remaining = FREE_AI_REFILL_PERIOD_MS - ((now - anchorMs) % FREE_AI_REFILL_PERIOD_MS)
    const mins = Math.max(1, Math.ceil(remaining / 60000))
    const wait =
      mins >= 60
        ? `about ${Math.round(mins / 60)} hour${mins >= 120 ? "s" : ""}`
        : `${mins} minute${mins === 1 ? "" : "s"}`
    return {
      userId: user.id,
      message: `You're out of free AI generations. You'll get another in ${wait}, or subscribe for unlimited AI tools.`,
      subscribed: false,
    }
  }
  return { userId: user.id, message: null, subscribed: false }
}

/**
 * Quota gate for the Reading Assistant, reusing the SAME free-tier token bucket
 * as every other AI tool (subscribers/admins unlimited). A token is NOT spent
 * here — call `spendAssistantToken` only after a message is answered so failed
 * requests stay free. Exported for the assistant route handler.
 */
export async function assistantQuotaGuard(): Promise<ContentToolGuard> {
  return contentToolGuard()
}

/** Spend one free-tier AI token for the assistant (no-op for subscribers). */
export async function spendAssistantToken(userId: string): Promise<void> {
  await consumeAiToken(userId)
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
    if (!guard.subscribed && guard.userId) await consumeAiToken(guard.userId)
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
    if (!guard.subscribed && guard.userId) await consumeAiToken(guard.userId)
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
    if (!guard.subscribed && guard.userId) await consumeAiToken(guard.userId)
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
  const prompt =
    `Translate the following text into ${language}. ` +
    `Preserve the meaning, tone, and paragraph breaks. ` +
    `Do not add notes, explanations, or quotation marks — output only the translation.\n\n` +
    chunk
  try {
    const { text } = await generateText({ model: TRANSLATE_MODEL, prompt })
    return stripAccents(text.trim())
  } catch {
    // Cross-provider fallback: if the primary translation model is rate-limited
    // or unavailable, retry once on the main OpenAI model (separate provider
    // bucket) so a single provider hiccup doesn't break translation.
    const { text } = await generateText({ model: MODEL, prompt })
    return stripAccents(text.trim())
  }
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
 * Confirms the given document belongs to the current (premium) user and returns
 * the userId. Throws otherwise. Used to scope the translation cache.
 */
async function requireOwnedDocument(documentId: number): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new Error("Please sign in to use AI features.")
  if (!hasActiveSubscription(user)) {
    throw new Error("An active subscription is required to use AI features.")
  }
  const [row] = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.id, documentId), eq(document.userId, user.id)))
    .limit(1)
  if (!row) throw new Error("Document not found.")
  return user.id
}

/**
 * Returns every cached translation for a document + target language in ONE
 * round trip, as a { sourceHash: translatedText } map. The client hydrates the
 * reader from this instantly on open so already-translated pages never hit the
 * translation API again. Empty object when nothing is cached yet.
 */
export async function getDocumentTranslations(
  documentId: number,
  targetLang: string,
): Promise<Record<string, string>> {
  const userId = await requireOwnedDocument(documentId)
  const rows = await db
    .select({
      sourceHash: documentTranslation.sourceHash,
      text: documentTranslation.text,
    })
    .from(documentTranslation)
    .where(
      and(
        eq(documentTranslation.documentId, documentId),
        eq(documentTranslation.userId, userId),
        eq(documentTranslation.lang, targetLang),
      ),
    )
  const map: Record<string, string> = {}
  for (const r of rows) map[r.sourceHash] = r.text
  return map
}

/**
 * Cache-aware single-section translation. Looks the passage up by its source
 * hash first (instant, no API call) and only translates + persists on a miss.
 * This is the write-through path used for on-demand and background translation
 * so a page is translated at most once, ever, per language.
 */
export async function translateDocumentSection(
  documentId: number,
  targetLang: string,
  input: string,
): Promise<string> {
  const userId = await requireOwnedDocument(documentId)
  const source = (input ?? "").trim()
  if (!source) return ""
  const hash = sectionHash(source)

  const [cached] = await db
    .select({ text: documentTranslation.text })
    .from(documentTranslation)
    .where(
      and(
        eq(documentTranslation.documentId, documentId),
        eq(documentTranslation.userId, userId),
        eq(documentTranslation.lang, targetLang),
        eq(documentTranslation.sourceHash, hash),
      ),
    )
    .limit(1)
  if (cached) return cached.text

  const translated = await translateChunk(source, languageName(targetLang))

  // Persist for next time. Ignore unique-conflict races (another concurrent
  // request cached the same section first) — the value is identical anyway.
  await db
    .insert(documentTranslation)
    .values({ documentId, userId, lang: targetLang, sourceHash: hash, text: translated })
    .onConflictDoNothing()

  return translated
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
    if (!guard.subscribed && guard.userId) await consumeAiToken(guard.userId)
    return { answer: text.trim() }
  } catch (e) {
    return { answer: "", error: friendlyAiError(e, "askDocument") }
  }
}

export interface BookEnrichment {
  summary: string
  themes: string[]
  difficulty: string
  readingLevel: string
  authorNote: string
}

/**
 * AI-generated marketing enrichment for a book's detail page (summary, themes,
 * difficulty, reading level, short author note). Generated ONCE and cached on
 * the book row, so repeat views are instant and cheap. This is public-facing
 * merchandising that drives purchases, so it is FREE for everyone and does NOT
 * draw from the AI quota (no `contentToolGuard`/`consumeAiToken`). Returns null
 * if the book doesn't exist or generation fails (the detail page simply omits
 * the section). Never sends full copyrighted text — only catalog metadata.
 */
export async function getBookEnrichment(
  bookId: number,
): Promise<BookEnrichment | null> {
  try {
    const [row] = await db
      .select({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category,
        description: book.description,
        excerpt: book.excerpt,
        aiSummary: book.aiSummary,
        aiThemes: book.aiThemes,
        aiDifficulty: book.aiDifficulty,
        aiReadingLevel: book.aiReadingLevel,
        aiAuthorNote: book.aiAuthorNote,
        aiEnrichedAt: book.aiEnrichedAt,
      })
      .from(book)
      .where(eq(book.id, bookId))
      .limit(1)
    if (!row) return null

    // Return the cached enrichment when present.
    if (row.aiEnrichedAt && row.aiSummary) {
      return {
        summary: row.aiSummary,
        themes: Array.isArray(row.aiThemes) ? (row.aiThemes as string[]) : [],
        difficulty: row.aiDifficulty ?? "",
        readingLevel: row.aiReadingLevel ?? "",
        authorNote: row.aiAuthorNote ?? "",
      }
    }

    const { object } = await generateObject({
      model: MODEL,
      schema: z.object({
        summary: z
          .string()
          .describe(
            "An inviting 2-3 sentence overview of what the book is about and why someone would read it. Do not include spoilers.",
          ),
        themes: z
          .array(z.string())
          .describe("3 to 5 short theme or topic tags, each 1-3 words."),
        difficulty: z
          .enum(["Easy", "Moderate", "Challenging"])
          .describe("How demanding the reading is for a general adult reader."),
        readingLevel: z
          .string()
          .describe(
            "A short audience descriptor, e.g. 'General adult', 'Young adult', 'Advanced'.",
          ),
        authorNote: z
          .string()
          .describe(
            "One or two sentences of context about the author relevant to this book.",
          ),
      }),
      prompt:
        "You are a book concierge writing catalog copy for a reading app. " +
        "Using only the metadata below, write helpful, accurate enrichment. " +
        "Do not invent facts you cannot infer.\n\n" +
        `Title: ${row.title}\n` +
        `Author: ${row.author}\n` +
        `Category: ${row.category}\n` +
        `Description: ${row.description}\n` +
        `Excerpt: ${row.excerpt}`,
    })

    // Cache it on the book row (best-effort; a failed write just means the
    // next view regenerates).
    await db
      .update(book)
      .set({
        aiSummary: object.summary,
        aiThemes: object.themes,
        aiDifficulty: object.difficulty,
        aiReadingLevel: object.readingLevel,
        aiAuthorNote: object.authorNote,
        aiEnrichedAt: new Date(),
      })
      .where(eq(book.id, bookId))

    return object
  } catch (e) {
    console.error("[v0] getBookEnrichment failed:", e)
    return null
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
  if (!guard.subscribed && guard.userId) await consumeAiToken(guard.userId)
  return text
}
