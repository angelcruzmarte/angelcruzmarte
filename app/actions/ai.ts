"use server"

import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { generateObject, generateText } from "ai"
import { z } from "zod"

const MODEL = "openai/gpt-5.4-mini"
const MAX_INPUT = 16000

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
