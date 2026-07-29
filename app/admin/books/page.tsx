import { listCommercialBooks } from "@/app/actions/admin"
import { AdminBooks } from "@/components/admin-books"

export default async function AdminBooksPage() {
  const books = await listCommercialBooks()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Commercial books</h1>
      <p className="mt-1 text-muted-foreground">
        Titles sold through our partner bookstore (Bookshop.org). Users listen
        to a free, publisher-provided sample in-app and buy the full book on the
        partner store via an affiliate link. Full copyrighted text is never
        stored or served in-app.
      </p>
      <div className="mt-8">
        <AdminBooks books={books} />
      </div>
    </div>
  )
}
