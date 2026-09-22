import { Suspense } from "react"
import {
  getFavoriteBookIds,
  getFavoriteBooks,
  getOwnedBookIds,
  getStorefrontData,
} from "@/app/actions/books"
import { getDocuments } from "@/app/actions/documents"
import { getCurrentUser, hasActiveSubscription } from "@/lib/session"
import { BooksStore } from "@/components/books-store"

export default async function BooksPage() {
  const [
    { books, personalized, storefront, languageCounts, categoryCounts },
    ownedIds,
    favoriteIds,
    favoriteBooks,
    uploads,
    user,
  ] = await Promise.all([
    getStorefrontData(),
    getOwnedBookIds(),
    getFavoriteBookIds(),
    getFavoriteBooks(),
    getDocuments(),
    getCurrentUser(),
  ])

  const subscribed = hasActiveSubscription(user)

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* Suspense boundary so useSearchParams (in CartReturnHandler) works. */}
      <Suspense fallback={null}>
        <BooksStore
          books={books}
          storefront={storefront}
          personalized={personalized}
          ownedIds={Array.from(ownedIds)}
          favoriteIds={Array.from(favoriteIds)}
          favoriteBooks={favoriteBooks}
          subscribed={subscribed}
          languageCounts={languageCounts}
          categoryCounts={categoryCounts}
          uploads={uploads}
        />
      </Suspense>
    </div>
  )
}
