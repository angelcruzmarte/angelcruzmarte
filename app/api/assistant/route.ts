import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai"
import { z } from "zod"
import { and, eq, ilike, or } from "drizzle-orm"
import { db } from "@/lib/db"
import { book } from "@/lib/db/schema"
import {
  assistantQuotaGuard,
  spendAssistantToken,
} from "@/app/actions/ai"

const MODEL = "openai/gpt-5.4-mini"

export const maxDuration = 30

const SYSTEM = [
  "You are VOXYFI's friendly reading concierge. You help readers discover books",
  "that are in the VOXYFI catalog. You must ONLY recommend books returned by the",
  "searchCatalog tool — never invent titles, authors, prices, or availability.",
  "Always call searchCatalog before recommending, using the reader's genres,",
  "moods, themes, or comparisons. If nothing relevant comes back, say so honestly",
  "and suggest broadening the request. Keep replies concise and warm: a sentence",
  "or two, then up to 3-4 specific picks with a one-line reason each. Do NOT",
  "discuss prices or purchasing mechanics — the book page handles buying. Never",
  "claim a book is free.",
].join(" ")

export async function POST(req: Request) {
  // Same free-tier token bucket as every other AI tool. No token is spent yet;
  // we only charge a successful answer in onFinish so failures stay free.
  const guard = await assistantQuotaGuard()
  if (guard.message) {
    return Response.json({ error: guard.message }, { status: 429 })
  }

  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: MODEL,
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(4),
    tools: {
      searchCatalog: tool({
        description:
          "Search the VOXYFI book catalog by keyword, author, category, or theme. Returns real, currently-available books. Always use this before recommending anything.",
        inputSchema: z.object({
          query: z
            .string()
            .describe(
              "Keywords: genre, mood, theme, author, or a comparison like 'similar to Dune'.",
            ),
          category: z
            .string()
            .optional()
            .describe("Optional exact category/genre filter."),
        }),
        execute: async ({ query, category }) => {
          const q = `%${query.trim()}%`
          const where = and(
            eq(book.published, true),
            category
              ? eq(book.category, category)
              : or(
                  ilike(book.title, q),
                  ilike(book.author, q),
                  ilike(book.category, q),
                  ilike(book.description, q),
                ),
          )
          const rows = await db
            .select({
              id: book.id,
              title: book.title,
              author: book.author,
              category: book.category,
              description: book.description,
            })
            .from(book)
            .where(where)
            .limit(8)

          return rows.map((r) => ({
            id: r.id,
            title: r.title,
            author: r.author,
            category: r.category,
            blurb: (r.description ?? "").slice(0, 200),
            url: `/app/books/${r.id}`,
          }))
        },
      }),
    },
    onFinish: async () => {
      // Charge one free-tier token for a completed answer (no-op for
      // subscribers/admins). Best-effort — never block the response.
      if (guard.userId && !guard.subscribed) {
        try {
          await spendAssistantToken(guard.userId)
        } catch (e) {
          console.error("[v0] assistant token spend failed:", e)
        }
      }
    },
  })

  return result.toUIMessageStreamResponse()
}
