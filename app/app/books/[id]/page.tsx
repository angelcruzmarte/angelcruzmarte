import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BadgeCheck, Sparkles } from "lucide-react"
import {
  confirmBookCheckout,
  getBook,
  isBookFavorited,
  ownsBook,
} from "@/app/actions/books"
import { formatPrice } from "@/lib/plans"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getTodayListenSeconds } from "@/app/actions/stats"
import { BookCover } from "@/components/book-cover"
import { BuyBookButton } from "@/components/buy-book-button"
import { BuyElsewhereButton } from "@/components/buy-elsewhere-button"
import { FavoriteButton } from "@/components/favorite-button"
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

  const book = await getBook(bookId)
  if (!book) notFound()

  // Fallback grant in case the webhook hasn't landed yet after redirect.
  if (purchased && session_id) {
    await confirmBookCheckout(session_id)
  }

  const [owned, favorited, user] = await Promise.all([
    ownsBook(bookId),
    isBookFavorited(bookId),
    getCurrentUser(),
  ])
  // Premium subscribers get the full narration experience (every voice, no
  // daily cap, translation, AI tools) even on previews of books they haven't
  // purchased yet. Book *ownership* still separately controls access to the
  // full text and offline downloads.
  const subscribed = hasActiveSubscription(user)
  const premiumNarration = owned || subscribed
  // Owners and subscribers listen with unlimited access; the free preview for
  // everyone else counts toward the daily listening cap.
  const initialListenSeconds = premiumNarration ? 0 : await getTodayListenSeconds()

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
          <div className="mb-2 flex items-center justify-between gap-2">
            <Badge variant="secondary">{book.category}</Badge>
            <FavoriteButton
              bookId={book.id}
              initialFavorited={favorited}
              className="h-9 w-9 border border-border bg-card"
            />
          </div>
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
          {!owned && (
            <BuyElsewhereButton
              title={book.title}
              author={book.author}
              className="mt-2 w-full sm:w-auto"
            />
          )}
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
        premium={premiumNarration}
        bookId={owned ? book.id : undefined}
        allowDownload={owned}
        initialListenSeconds={initialListenSeconds}
      />
    </div>
  )
}
