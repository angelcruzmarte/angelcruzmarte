import { Suspense } from "react"
import {
  getFavoriteBookIds,
  getOwnedBookIds,
  getStorefrontData,
} from "@/app/actions/books"
import { getDocuments } from "@/app/actions/documents"
import { BooksStore } from "@/components/books-store"

export default async function BooksPage() {
  const [{ books, personalized, storefront }, ownedIds, favoriteIds, uploads] =
    await Promise.all([
      getStorefrontData(),
      getOwnedBookIds(),
      getFavoriteBookIds(),
      getDocuments(),
    ])

  // Per-request rotation seed. The books page is dynamically rendered (it reads
  // the session), so computing this once on the server and passing it down
  // keeps SSR and client hydration identical while still changing on each visit
  // — this drives the rotating "Browse by category" shelves in BooksStore.
  const rotationSeed = Date.now()

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
          uploads={uploads}
          rotationSeed={rotationSeed}
        />
      </Suspense>
    </div>
  )
}
