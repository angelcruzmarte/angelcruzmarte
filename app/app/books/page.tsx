import { getPersonalizedBooks } from "@/app/actions/books"
import { BooksStore } from "@/components/books-store"

export default async function BooksPage() {
  const { books, personalized } = await getPersonalizedBooks()

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-3xl font-bold tracking-tight">Book Store</h1>
      <BooksStore books={books} personalized={personalized} />
    </div>
  )
}
