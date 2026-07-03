import { getOwnedBookIds, getPersonalizedBooks } from "@/app/actions/books"
import { getDocuments } from "@/app/actions/documents"
import { BooksStore } from "@/components/books-store"

export default async function BooksPage() {
  const [{ books, personalized }, ownedIds, uploads] = await Promise.all([
    getPersonalizedBooks(),
    getOwnedBookIds(),
    getDocuments(),
  ])

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Book Store</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Upload your own books to listen free, or buy from the store.
      </p>
      <BooksStore
        books={books}
        personalized={personalized}
        ownedIds={Array.from(ownedIds)}
        uploads={uploads}
      />
    </div>
  )
}
