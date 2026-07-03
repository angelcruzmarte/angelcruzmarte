import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeCheck, Sparkles } from "lucide-react"
import {
  confirmBookCheckout,
  getBook,
  ownsBook,
} from "@/app/actions/books"
import { getCurrentUser } from "@/lib/session"
import { formatPrice } from "@/lib/plans"
import { BookCover } from "@/components/book-cover"
import { BuyBookButton } from "@/components/buy-book-button"
import { ListenPlayer } from "@/components/listen-player"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function BookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ purchased?: string; session_id?: string }>
}) {
  const { id } = await params
  const { purchased, session_id } = await searchParams
  const bookId = Number(id)
  if (Number.isNaN(bookId)) notFound()

  const [book, user] = await Promise.all([getBook(bookId), getCurrentUser()])
  if (!book) notFound()

  // Fallback grant in case the webhook hasn't landed yet after redirect.
  if (purchased && session_id) {
    await confirmBookCheckout(session_id)
  }

  const owned = await ownsBook(bookId)

  return (
    <div className="px-4 py-6 sm:px-6">
      <Link
        href="/app/books"
        className={buttonVariants({ variant: "ghost", size: "sm" }) + " mb-4 gap-1.5"}
      >
        <ArrowLeft className="h-4 w-4" />
        Book Store
      </Link>

      <div className="flex gap-4">
        <BookCover book={book} className="w-28 shrink-0" />
        <div className="min-w-0">
          <Badge variant="secondary" className="mb-2">
            {book.category}
          </Badge>
          <h1 className="text-2xl font-bold leading-tight text-balance">
            {book.title}
          </h1>
          <p className="mt-1 text-muted-foreground">{book.author}</p>
          {owned ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
              <BadgeCheck className="h-4 w-4" />
              In your library
            </p>
          ) : (
            <p className="mt-3 text-lg font-bold">
              {formatPrice(book.priceInCents)}
            </p>
          )}
          <BuyBookButton
            bookId={book.id}
            priceInCents={book.priceInCents}
            owned={owned}
            className="mt-3 gap-2"
          />
        </div>
      </div>

      <p className="mt-6 leading-relaxed text-pretty">{book.description}</p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">
        {owned ? "Listen to the full book" : "Listen to a preview"}
      </h2>

      {!owned && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
          <Sparkles className="h-4 w-4 shrink-0" />
          Buy this book to unlock the full text-to-speech audio and save it to
          your library.
        </div>
      )}

      <ListenPlayer
        title={book.title}
        author={book.author}
        content={owned ? book.content : book.excerpt.slice(0, 600)}
        backHref="/app/books"
        backLabel="Book Store"
        premium={owned}
        bookId={owned ? book.id : undefined}
        allowDownload={owned}
      />
    </div>
  )
}
