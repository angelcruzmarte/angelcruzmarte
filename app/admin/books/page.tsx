import { listCatalogBooks } from "@/app/actions/admin"
import { AdminBooks } from "@/components/admin-books"

export default async function AdminBooksPage() {
  const books = await listCatalogBooks()

  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Book catalog</h1>
      <p className="mt-1 max-w-3xl text-muted-foreground">
        Manage every title in the store. VOXYFI titles are sold and listened to
        in-app; Bookshop.org titles offer a free in-app sample and buy through
        our affiliate link. Unpublished titles stay here but are hidden from the
        storefront.
      </p>
      <div className="mt-8">
        <AdminBooks books={books} />
      </div>
    </div>
  )
}
