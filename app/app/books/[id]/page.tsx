import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Lock } from "lucide-react"
import { getBook } from "@/app/actions/books"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { BookCover } from "@/components/book-cover"
import { ListenPlayer } from "@/components/listen-player"
import { buttonVariants } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const bookId = Number(id)
  if (Number.isNaN(bookId)) notFound()

  const [book, user] = await Promise.all([getBook(bookId), getCurrentUser()])
  if (!book) notFound()
  const subscribed = hasActiveSubscription(user)

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
        </div>
      </div>

      <p className="mt-5 leading-relaxed text-pretty">{book.description}</p>

      <h2 className="mb-1 mt-8 text-lg font-semibold">
        {subscribed ? "Listen" : "Listen to a preview"}
      </h2>
      {!subscribed && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-primary/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 text-primary">
            <Lock className="h-4 w-4" />
            Subscribe to listen to the full book.
          </span>
          <Link
            href="/subscribe"
            className={buttonVariants({ size: "sm" })}
          >
            Upgrade
          </Link>
        </div>
      )}
    </div>
  )
}
