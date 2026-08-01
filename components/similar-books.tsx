import Link from "next/link"
import { BookCover } from "@/components/book-cover"
import { getRelatedBooks } from "@/app/actions/books"

/**
 * "Similar Books" rail for the book detail page. Server component: fetches
 * related titles (same category first, then backfill) and renders lean,
 * navigable cards from the shared BookCover primitive. Renders nothing when
 * there are no related titles, so the section never shows up empty.
 */
export async function SimilarBooks({
  bookId,
  category,
}: {
  bookId: number
  category: string
}) {
  const related = await getRelatedBooks(bookId, category, 12)
  if (related.length === 0) return null

  return (
    <section aria-labelledby="similar-books-heading" className="mt-10">
      <h2
        id="similar-books-heading"
        className="mb-4 text-lg font-semibold text-foreground"
      >
        Similar Books
      </h2>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
        {related.map((b) => (
          <Link
            key={b.id}
            href={`/app/books/${b.id}`}
            className="group w-32 shrink-0 snap-start"
          >
            <BookCover
              book={b}
              className="w-full transition-shadow group-hover:shadow-lg"
            />
            <p className="mt-2 line-clamp-2 text-sm font-medium leading-snug text-foreground">
              {b.title}
            </p>
            <p className="line-clamp-1 text-xs text-muted-foreground">
              {b.author}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
