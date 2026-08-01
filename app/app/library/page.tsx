import Link from "next/link"
import { FileX2, Plus } from "lucide-react"
import { getPurchasedBooks } from "@/app/actions/books"
import { getDocuments } from "@/app/actions/documents"
import { LibraryView } from "@/components/library-view"
import { buttonVariants } from "@/components/ui/button"

// This route reads the signed-in user's documents/books at request time, so it
// must never be statically prerendered at build.
export const dynamic = "force-dynamic"

export default async function LibraryPage() {
  const [docs, books] = await Promise.all([
    getDocuments(),
    getPurchasedBooks(),
  ])

  const empty = docs.length === 0 && books.length === 0

  return (
    <div className="px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-3xl font-bold tracking-tight">Library</h1>

      {empty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary text-muted-foreground">
            <FileX2 className="h-9 w-9" />
          </span>
          <p className="text-lg font-medium text-muted-foreground">
            Your library is empty
          </p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Buy a book from the store or upload a document to start listening.
          </p>
          <div className="flex gap-2">
            <Link
              href="/app/new"
              className={buttonVariants({ size: "lg" }) + " gap-2"}
            >
              <Plus className="h-4 w-4" />
              Add content
            </Link>
            <Link
              href="/app/books"
              className={
                buttonVariants({ variant: "outline", size: "lg" }) + " gap-2"
              }
            >
              Browse books
            </Link>
          </div>
        </div>
      ) : (
        <LibraryView documents={docs} books={books} />
      )}
    </div>
  )
}
