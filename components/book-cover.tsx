import type { Book } from "@/lib/db/schema"

export function BookCover({
  book,
  className = "",
}: {
  book: Pick<Book, "title" | "author" | "coverColor" | "accentColor">
  className?: string
}) {
  return (
    <div
      className={`relative flex aspect-[2/3] flex-col justify-between overflow-hidden rounded-lg p-3 shadow-md ${className}`}
      style={{ backgroundColor: book.coverColor }}
    >
      <span
        className="h-1.5 w-8 rounded-full"
        style={{ backgroundColor: book.accentColor }}
        aria-hidden
      />
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: book.accentColor, opacity: 0.6 }}
        aria-hidden
      />
      <div>
        <p
          className="text-pretty text-[0.95rem] font-bold leading-tight text-white"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
        >
          {book.title}
        </p>
        <p className="mt-1 text-[0.7rem] font-medium uppercase tracking-wide text-white/75">
          {book.author}
        </p>
      </div>
    </div>
  )
}
