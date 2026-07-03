"use server"

import { chunkText } from "@/lib/chunk-text"
import { languageName } from "@/lib/languages"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { generateObject, generateText } from "ai"
import { z } from "zod"

const MODEL = "openai/gpt-5.4-mini"
const MAX_INPUT = 16000
// Upper bound on how much text we translate in one request to keep latency and
// cost reasonable. Longer documents are translated up to this point.
const MAX_TRANSLATE = 24000
// Per-request translation chunk size (chars). Smaller = faster first result.
const TRANSLATE_CHUNK = 2200

async function requirePremium() {
  const user = await getCurrentUser()
  if (!user) throw new Error("Please sign in to use AI features.")
  if (!hasActiveSubscription(user)) {
    throw new Error("An active subscription is required to use AI features.")
  }
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
}

async function translateChunk(chunk: string, language: string) {
  const { text } = await generateText({
    model: MODEL,
    prompt:
      `Translate the following text into ${language}. ` +
      `Preserve the meaning, tone, and paragraph breaks. ` +
      `Do not add notes, explanations, or quotation marks — output only the translation.\n\n` +
      chunk,
  })
  return text.trim()
}

/**
 * Translates document text into the target language for reading/narration.
 * The text is split into chunks (up to MAX_TRANSLATE characters) that are
 * translated concurrently and rejoined, so even long documents complete well
 * within the serverless time limit.
 */
export async function translateText(
  input: string,
  targetLang: string,
): Promise<TranslationResult> {
  await requirePremium()
  const source = (input ?? "").trim()
  if (!source) throw new Error("There is no text to translate.")

  const language = languageName(targetLang)
  const truncated = source.length > MAX_TRANSLATE
  const capped = source.slice(0, MAX_TRANSLATE)
  const chunks = chunkText(capped, TRANSLATE_CHUNK)

  // Translate all chunks in parallel to keep total latency low.
  const out = await Promise.all(chunks.map((c) => translateChunk(c, language)))

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
