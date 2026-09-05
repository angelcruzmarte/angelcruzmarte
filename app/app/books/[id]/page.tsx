import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { ArrowLeft, BadgeCheck, Sparkles } from "lucide-react"
import {
  confirmBookCheckout,
  getBook,
  getBookRating,
  isBookFavorited,
  ownsBook,
} from "@/app/actions/books"
import { getBookReviews } from "@/app/actions/reviews"
import { formatPrice } from "@/lib/plans"
import { estimateReadingStats } from "@/lib/reading-time"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { getTodayListenSeconds } from "@/app/actions/stats"
import { affiliateFormatsForBook } from "@/lib/affiliate-settings"
import {
  AffiliateBuyNote,
  AffiliateDisclosure,
} from "@/components/affiliate-disclosure"
import { BookCover } from "@/components/book-cover"
import {
  BookDetailEnrichment,
  BookDetailEnrichmentSkeleton,
} from "@/components/book-detail-enrichment"
import { BookRating } from "@/components/book-rating"
import { BookReviews } from "@/components/book-reviews"
import { SimilarBooks } from "@/components/similar-books"
import { BuyBookButton } from "@/components/buy-book-button"
import { AmazonBuyFormats } from "@/components/amazon-buy-formats"
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

  // Commercial titles are fulfilled by our affiliate partner (Amazon): users
  // listen to a free in-app sample and buy the full book on Amazon with our
  // Associate tag applied. We never sell them via Stripe or serve their full
  // copyrighted text.
  const isAffiliate = book.fulfillment === "affiliate"
  // Digital-first: Kindle → Audible → Print. The primary buy action is the
  // first entry (Kindle); the rest surface behind "View other formats".
  const amazonFormats = isAffiliate
    ? await affiliateFormatsForBook({
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        buyUrl: book.buyUrl,
        kindleAsin: book.kindleAsin,
        audibleAsin: book.audibleAsin,
        printAsin: book.printAsin,
      })
    : []

  // Fallback grant in case the webhook hasn't landed yet after redirect.
  if (purchased && session_id && !isAffiliate) {
    await confirmBookCheckout(session_id)
  }

  const [owned, favorited, user, ratingSummary, reviews] = await Promise.all([
    ownsBook(bookId),
    isBookFavorited(bookId),
    getCurrentUser(),
    getBookRating(bookId),
    getBookReviews(bookId),
  ])

  // Reading/listening estimate from the fullest text we have. For affiliate
  // titles that's the in-app sample; for in-app books it's the full content.
  const readingStats = estimateReadingStats(
    isAffiliate ? book.sampleText || book.excerpt : book.content || book.excerpt,
  )
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

      <div className="flex items-start gap-4">
        <BookCover book={book} className="w-28 shrink-0 self-start" />
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
          {isAffiliate ? (
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              Free sample to listen · Full book on Amazon
            </p>
          ) : owned ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-primary">
              <BadgeCheck className="h-4 w-4" />
              In your library
            </p>
          ) : (
            <p className="mt-3 text-lg font-bold">
              {formatPrice(book.priceInCents)}
            </p>
          )}

          {isAffiliate ? (
            // Commercial title: primary action is the Amazon affiliate link.
            // The paid-link note sits directly under the button so the FTC
            // disclosure is visible *before* the click.
            <div className="mt-3 flex flex-col gap-2">
              <AmazonBuyFormats
                formats={amazonFormats}
                bookId={book.id}
                title={book.title}
                author={book.author}
              />
              <AffiliateBuyNote />
            </div>
          ) : (
            <BuyBookButton
              bookId={book.id}
              priceInCents={book.priceInCents}
              owned={owned}
              className="mt-3 gap-2"
            />
          )}
        </div>
      </div>

      <p className="mt-6 leading-relaxed text-pretty">{book.description}</p>

      {/* AI-enriched "About this book" + reading/listening estimates. Streamed
          so the page shell (and buy button) render immediately. */}
      <Suspense fallback={<BookDetailEnrichmentSkeleton />}>
        <BookDetailEnrichment bookId={book.id} readingStats={readingStats} />
      </Suspense>

      <h2 className="mb-2 mt-8 text-lg font-semibold">
        {isAffiliate
          ? "Listen to a sample"
          : owned
            ? "Listen to the full book"
            : "Listen to a preview"}
      </h2>

      {isAffiliate ? (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
            <Sparkles className="h-4 w-4 shrink-0" />
            Enjoy this free sample, then get the full book on Amazon.
          </div>
          <AffiliateDisclosure className="px-1" />
        </div>
      ) : (
        !owned && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">
            <Sparkles className="h-4 w-4 shrink-0" />
            Buy this book to unlock the full text-to-speech audio and save it to
            your library.
          </div>
        )
      )}

      <ListenPlayer
        title={book.title}
        author={book.author}
        content={
          isAffiliate
            ? book.sampleText?.trim() || book.excerpt
            : owned
              ? book.content
              : book.excerpt.slice(0, 600)
        }
        backHref="/app/books"
        backLabel="Book Store"
        premium={premiumNarration}
        bookId={!isAffiliate && owned ? book.id : undefined}
        allowDownload={!isAffiliate && owned}
        initialListenSeconds={initialListenSeconds}
      />

      {/* VOXYFI's own ratings — for every book, including affiliate titles.
          Amazon stays purchase-only; ratings never link out to Amazon. */}
      <BookRating bookId={book.id} initial={ratingSummary} />

      {/* User-generated written reviews with Report/Block controls (Apple UGC
          safety). Author identity is public display info only, never email. */}
      <BookReviews
        bookId={book.id}
        initialReviews={reviews}
        viewer={user ? { id: user.id, canPost: user.status === "active" } : null}
        initialMyStars={ratingSummary.mine}
      />

      {/* Similar Books rail (same category first). Streamed independently. */}
      <Suspense fallback={null}>
        <SimilarBooks bookId={book.id} category={book.category} />
      </Suspense>
    </div>
  )
}
