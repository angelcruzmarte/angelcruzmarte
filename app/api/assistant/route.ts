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
            .describe("Optional category/genre hint, e.g. 'mystery' or 'romance'."),
        }),
        execute: async ({ query, category }) => {
          // Tokenize the query so a phrase like "classics like Jane Austen"
          // matches on "classics", "jane", or "austen" rather than requiring
          // the whole string in one field. Drop short/stopword tokens so we
          // don't match on "like"/"and". Each token may appear in any field.
          const STOP = new Set([
            "the", "and", "for", "with", "like", "about", "some", "something",
            "book", "books", "read", "reading", "want", "recommend", "similar",
            "that", "this", "from", "give", "novel", "novels", "story", "stories",
          ])
          // Fold any category hint into the keyword tokens. The model often
          // passes loose values like "fiction" that never EXACTLY equal a real
          // category ("Historical Fiction", "Science Fiction"), so we match
          // categories by partial ILIKE alongside the query tokens rather than
          // an exact equality filter that would zero out the results.
          const tokens = Array.from(
            new Set(
              `${query} ${category ?? ""}`
                .toLowerCase()
                .split(/[^a-z0-9]+/i)
                .filter((t) => t.length >= 3 && !STOP.has(t)),
            ),
          ).slice(0, 8)

          const tokenMatch =
            tokens.length > 0
              ? or(
                  ...tokens.flatMap((t) => {
                    const p = `%${t}%`
                    return [
                      ilike(book.title, p),
                      ilike(book.author, p),
                      ilike(book.category, p),
                      ilike(book.description, p),
                    ]
                  }),
                )
              : // No usable tokens — fall back to the raw phrase.
                ilike(book.title, `%${query.trim()}%`)

          const where = and(eq(book.published, true), tokenMatch)

          const rows = await db
            .select({
              id: book.id,
              title: book.title,
              author: book.author,
              category: book.category,
              description: book.description,
              featured: book.featured,
            })
            .from(book)
            .where(where)
            .limit(24)

          // Rank by how many distinct tokens a row matches (title/author
          // weighted higher), so the best fits surface within the top results.
          const scored = rows
            .map((r) => {
              const hay = `${r.title} ${r.author} ${r.category}`.toLowerCase()
              const strong = tokens.filter((t) => hay.includes(t)).length
              const desc = (r.description ?? "").toLowerCase()
              const weak = tokens.filter((t) => desc.includes(t)).length
              return { r, score: strong * 3 + weak + (r.featured ? 0.5 : 0) }
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)

          return scored.map(({ r }) => ({
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
