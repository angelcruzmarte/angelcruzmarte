import { notFound, redirect } from "next/navigation"
import { db } from "@/lib/db"
import { book, bookPurchase } from "@/lib/db/schema"
import { getCurrentUser } from "@/lib/session"
import { and, eq } from "drizzle-orm"
import { ListenPlayer } from "@/components/listen-player"

// Allow time for on-demand translation of long documents.
export const maxDuration = 60

export default async function BookListenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const bookId = Number(id)
  if (Number.isNaN(bookId)) notFound()

  const user = await getCurrentUser()
  if (!user) redirect("/sign-in")

  // Only owners can reach the full-book player.
  const [purchase] = await db
    .select()
    .from(bookPurchase)
    .where(
      and(eq(bookPurchase.userId, user.id), eq(bookPurchase.bookId, bookId)),
    )
    .limit(1)
  if (!purchase) redirect(`/app/books/${bookId}`)

  const [row] = await db.select().from(book).where(eq(book.id, bookId)).limit(1)
  if (!row) notFound()

  // Defensive: commercial (affiliate) titles never have full in-app text, so
  // the full-book player is never valid for them — send back to the detail
  // page (with its free sample + partner buy link).
  if (row.fulfillment === "affiliate") redirect(`/app/books/${bookId}`)

  return (
    <ListenPlayer
      title={row.title}
      author={row.author}
      content={row.content}
      backHref={`/app/books/${bookId}`}
      backLabel={row.title}
      premium
      allowDownload
      bookId={bookId}
      initialWord={purchase.lastWord}
    />
  )
}
