import type { Book } from "@/lib/db/schema"
import { BookCover } from "@/components/book-cover"

/**
 * A decorative hero that scrolls two rows of book covers in opposite
 * directions. Purely visual — covers are duplicated so the loop is seamless
 * and the animation pauses for users who prefer reduced motion.
 */
export function BookMarquee({ books }: { books: Book[] }) {
  if (books.length === 0) return null

  // Split into two rows and keep rows reasonably sized.
  const half = Math.ceil(books.length / 2)
  const rowA = books.slice(0, half).slice(0, 14)
  const rowB = books.slice(half).slice(0, 14)
  // Guarantee enough covers to fill wide screens.
  const ensure = (row: Book[]) => (row.length >= 6 ? row : books.slice(0, 8))

  return (
    <div
      className="relative -mx-4 overflow-hidden rounded-2xl bg-secondary/60 py-5 sm:-mx-6"
      aria-hidden
    >
      <MarqueeRow books={ensure(rowA)} direction="left" />
      <div className="h-4" />
      <MarqueeRow books={ensure(rowB)} direction="right" />

      {/* Soft fade on both edges. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
    </div>
  )
}

function MarqueeRow({
  books,
  direction,
}: {
  books: Book[]
  direction: "left" | "right"
}) {
  // Duplicate the row so translating by -50% loops seamlessly.
  const doubled = [...books, ...books]
  return (
    <div className="flex w-max">
      <div
        className={`flex w-max gap-3 pr-3 ${
          direction === "left" ? "animate-marquee-left" : "animate-marquee-right"
        }`}
      >
        {doubled.map((book, i) => (
          <div key={`${book.id}-${i}`} className="w-20 shrink-0 sm:w-24">
            <BookCover book={book} className="w-full shadow-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
