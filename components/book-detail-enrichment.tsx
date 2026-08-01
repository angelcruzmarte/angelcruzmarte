import { BookOpen, Gauge, GraduationCap, Headphones, Sparkles } from "lucide-react"
import { getBookEnrichment } from "@/app/actions/ai"
import { Badge } from "@/components/ui/badge"
import { formatMinutes, type ReadingStats } from "@/lib/reading-time"

/**
 * AI-enriched detail section: estimated reading/listening time (computed, no
 * AI), plus a cached AI summary, difficulty, reading level, themes, and a short
 * author note. Async server component — wrap in <Suspense> so the page shell
 * renders immediately while enrichment streams in. Generation is cached on
 * first view and is free (never counts against the AI quota).
 */
export async function BookDetailEnrichment({
  bookId,
  readingStats,
}: {
  bookId: number
  readingStats: ReadingStats
}) {
  const enrichment = await getBookEnrichment(bookId)
  const hasTime = readingStats.words > 0
  const chips: Array<{ icon: typeof BookOpen; label: string }> = []

  if (hasTime) {
    chips.push({
      icon: BookOpen,
      label: `${formatMinutes(readingStats.readMinutes)} read`,
    })
    chips.push({
      icon: Headphones,
      label: `${formatMinutes(readingStats.listenMinutes)} listen`,
    })
  }
  if (enrichment?.difficulty) {
    chips.push({ icon: Gauge, label: enrichment.difficulty })
  }
  if (enrichment?.readingLevel) {
    chips.push({ icon: GraduationCap, label: enrichment.readingLevel })
  }

  // Nothing to show (no text length and enrichment unavailable): render nothing.
  if (chips.length === 0 && !enrichment?.summary) return null

  return (
    <section aria-labelledby="about-heading" className="mt-8">
      {chips.length > 0 ? (
        <ul className="mb-4 flex flex-wrap gap-2" aria-label="Book details">
          {chips.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground"
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {enrichment?.summary ? (
        <>
          <h2
            id="about-heading"
            className="mb-2 flex items-center gap-1.5 text-lg font-semibold"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            About this book
          </h2>
          <p className="leading-relaxed text-pretty">{enrichment.summary}</p>

          {enrichment.themes.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Themes">
              {enrichment.themes.map((t) => (
                <li key={t}>
                  <Badge variant="secondary">{t}</Badge>
                </li>
              ))}
            </ul>
          ) : null}

          {enrichment.authorNote ? (
            <div className="mt-4">
              <h3 className="mb-1 text-sm font-semibold">About the author</h3>
              <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                {enrichment.authorNote}
              </p>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            AI-generated overview. Details may not be perfect.
          </p>
        </>
      ) : null}
    </section>
  )
}

/** Lightweight skeleton shown while the enrichment section streams in. */
export function BookDetailEnrichmentSkeleton() {
  return (
    <section className="mt-8" aria-hidden>
      <div className="mb-4 flex flex-wrap gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
      <div className="mt-2 space-y-2">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </div>
    </section>
  )
}
